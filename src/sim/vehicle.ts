import { PLACES, PLACE_BY_ID, ROUTE_BY_ID } from "@/data";
import { bearing, getRouteIndex, haversineKm, lerpAngle, pointAtKm, projectToRoute, type RouteIndex } from "@/lib/geo";
import { RULES } from "@/lib/planning";
import type { LngLat, Telemetry, Trip, Vehicle } from "@/lib/types";
import { BREAKDOWN_FAULT, type IncidentBook } from "./incidents";
import { hash01, hashStr, mulberry32 } from "./rng";
import type { TripScript } from "./scenario";

const MIN = 60_000;
/** Aceleración y frenado de un tractocamión cargado, en m/s². */
const ACC = 0.45;
const DEC = 1.0;
/** Consumo en marcha (L/km) y ralentí (L/h). */
const L_PER_KM = 0.35;
const IDLE_LPH = 2.5;
/** Bajo esta velocidad (m/s) se considera detenido. */
const MOVING_EPS = 0.3;
/** Distancia a la que se da por llegado a una parada. */
const ARRIVE_M = 4;

export type Phase = "idle" | "loading" | "driving" | "resting" | "waiting" | "stopped" | "unloading";

interface Active {
  trip: Trip;
  script: TripScript;
  idx: RouteIndex;
  /** Velocidad base en m/s (distancia de la ruta / duración base). */
  baseMs: number;
  cps: { km: number; waitMs: number; placeId: string }[];
  cpNext: number;
  stopDone: boolean;
}

type TargetKind = "end" | "checkpoint" | "stop";

/** Un camión: máquina de estados que solo expone telemetría. */
export class VehicleSim {
  readonly vehicle: Vehicle;
  phase: Phase = "idle";
  coord: LngLat;
  heading: number;
  /** m/s */
  speed = 0;
  ignition = false;

  private readonly trips: Trip[];
  private readonly scripts: Record<string, TripScript>;
  private tripIdx = 0;
  private act: Active | null = null;
  private placeId: string;
  private km = 0;
  private phaseStart = 0;
  private phaseMs = 0;
  private waitPlace = "";
  private fuelL: number;
  private odometer: number;
  /** Conducción acumulada desde el último descanso. */
  private drivingMs = 0;
  /** Tiempo detenido de corrido. */
  private stoppedMs = 0;

  constructor(vehicle: Vehicle, trips: Trip[], scripts: Record<string, TripScript>, seed: number) {
    this.vehicle = vehicle;
    this.trips = trips;
    this.scripts = scripts;
    const r = mulberry32(hashStr(`${seed}|${vehicle.id}`));
    this.fuelL = vehicle.fuelCapacityL * (0.6 + r() * 0.4);
    this.odometer = Math.round(90_000 + r() * 520_000);
    const first = trips[0] ? ROUTE_BY_ID[trips[0].routeId] : undefined;
    this.placeId = first ? first.originId : "cd-pudahuel";
    this.heading = first ? bearing(first.coordinates[0], first.coordinates[1]) : r() * 360;
    this.coord = this.parkedCoord(this.placeId);
  }

  /** Viaje que se está ejecutando (cargando, en ruta o descargando). */
  get currentTrip(): Trip | null {
    return this.phase === "idle" ? null : (this.trips[this.tripIdx] ?? null);
  }

  isDriving(): boolean {
    return this.phase === "driving";
  }

  /** Detiene el camión donde está (avería). */
  halt(): void {
    this.speed = 0;
  }

  // ───────────────────────── Paso de simulación ─────────────────────────

  step(dtMs: number, now: number, inc: IncidentBook): void {
    const dt = dtMs / 1000;
    switch (this.phase) {
      case "idle":
        this.tryStartLoading(now);
        break;
      case "loading":
        if (now - this.phaseStart >= this.phaseMs && !inc.portDelayed(this.placeId)) this.depart(now);
        break;
      case "unloading":
        if (now - this.phaseStart >= this.phaseMs && !inc.portDelayed(this.placeId)) {
          this.finishTrip();
          this.tryStartLoading(now);
        }
        break;
      case "waiting":
        if (now - this.phaseStart >= this.phaseMs && !inc.borderClosed(this.waitPlace)) this.resume(now);
        break;
      case "stopped":
      case "resting":
        if (now - this.phaseStart >= this.phaseMs) this.resume(now);
        break;
      case "driving":
        this.drive(dt, now, inc);
        break;
    }

    // Contadores de conducción continua y consumo en ralentí.
    if (this.speed > MOVING_EPS) {
      this.drivingMs += dtMs;
      this.stoppedMs = 0;
    } else {
      this.stoppedMs += dtMs;
      if (this.stoppedMs >= RULES.mandatoryRestMin * MIN) this.drivingMs = 0;
      if (this.ignition) this.fuelL = Math.max(0, this.fuelL - (IDLE_LPH * dt) / 3600);
    }
  }

  private tryStartLoading(now: number): void {
    const trip = this.trips[this.tripIdx];
    if (!trip || now < trip.plannedLoadStart) return;
    const route = ROUTE_BY_ID[trip.routeId];
    this.placeId = route.originId;
    this.coord = this.parkedCoord(this.placeId);
    this.phase = "loading";
    this.phaseStart = now;
    this.phaseMs = (trip.plannedLoadMin + (this.scripts[trip.id]?.extraLoadMin ?? 0)) * MIN;
    this.ignition = false;
    this.speed = 0;
    // Carga de combustible en la base si va con poco.
    if (this.fuelL / this.vehicle.fuelCapacityL < 0.3) {
      this.fuelL = this.vehicle.fuelCapacityL * (0.9 + 0.1 * hash01(`${this.vehicle.id}|fuel|${this.tripIdx}`));
    }
  }

  private depart(now: number): void {
    const trip = this.trips[this.tripIdx];
    const route = ROUTE_BY_ID[trip.routeId];
    const idx = getRouteIndex(route.id);
    const cps = route.checkpoints
      .map((c) => ({
        km: projectToRoute(idx, PLACE_BY_ID[c.placeId].coord, c.km, 40).km,
        waitMs: c.plannedWaitMin * MIN,
        placeId: c.placeId,
      }))
      .sort((a, b) => a.km - b.km);
    this.act = {
      trip,
      script: this.scripts[trip.id],
      idx,
      baseMs: (idx.totalKm * 1000) / (route.baseDurationMin * 60),
      cps,
      cpNext: 0,
      stopDone: false,
    };
    this.km = 0;
    this.coord = pointAtKm(idx, 0).coord;
    this.phase = "driving";
    this.phaseStart = now;
    this.ignition = true;
    this.speed = 0;
  }

  private resume(now: number): void {
    this.phase = "driving";
    this.phaseStart = now;
    this.ignition = true;
  }

  private finishTrip(): void {
    this.tripIdx++;
    this.act = null;
    this.km = 0;
    this.phase = "idle";
    this.ignition = false;
    this.speed = 0;
  }

  // ───────────────────────── Conducción ─────────────────────────

  private nextTarget(a: Active): { km: number; kind: TargetKind } {
    while (a.cpNext < a.cps.length && a.cps[a.cpNext].km <= this.km - 1e-6) a.cpNext++;
    let best: { km: number; kind: TargetKind } = { km: a.idx.totalKm, kind: "end" };
    if (a.cpNext < a.cps.length && a.cps[a.cpNext].km < best.km) best = { km: a.cps[a.cpNext].km, kind: "checkpoint" };
    const s = a.script?.stop;
    if (s && !a.stopDone && s.km > this.km && s.km < best.km) best = { km: s.km, kind: "stop" };
    return best;
  }

  /** Velocidad deseada del viaje en m/s en el km actual (variación suave de ±6 %). */
  private cruise(a: Active): number {
    const s = a.script;
    const noise = 0.5 * Math.sin(this.km * 0.27 + s.p1) + 0.5 * Math.sin(this.km * 0.83 + s.p2);
    return a.baseMs * (1 + s.bias + 0.03 * noise);
  }

  /** El descanso no se hace dentro de una geocerca ni a minutos del destino. */
  private canRest(a: Active): boolean {
    if (a.idx.totalKm - this.km < 2.5) return false;
    return PLACES.every((p) => haversineKm(this.coord, p.coord) > p.radiusM / 1000 + 0.3);
  }

  private moveBy(a: Active, dKm: number, dt: number): void {
    this.km = Math.min(a.idx.totalKm, this.km + dKm);
    this.odometer += dKm;
    this.fuelL = Math.max(0, this.fuelL - dKm * L_PER_KM);
    const p = pointAtKm(a.idx, this.km);
    this.coord = p.coord;
    this.heading = lerpAngle(this.heading, p.heading, Math.min(1, dt * 0.8));
  }

  private drive(dt: number, now: number, inc: IncidentBook): void {
    const a = this.act;
    if (!a) return;

    // Avería: detenido donde está, motor apagado.
    if (inc.hasBreakdown(this.vehicle.id)) {
      this.speed = 0;
      this.ignition = false;
      return;
    }
    this.ignition = true;

    const target = this.nextTarget(a);
    const dist = (target.km - this.km) * 1000;
    const restDue = this.drivingMs >= RULES.maxContinuousDrivingMin * MIN && this.canRest(a);

    let vmax = this.cruise(a) * inc.congestionFactor(this.coord, this.vehicle.id);
    if (restDue) vmax = 0;
    else if (dist > ARRIVE_M) vmax = Math.min(vmax, Math.max(Math.sqrt(2 * DEC * (dist - ARRIVE_M)), 1.2));

    const v0 = this.speed;
    const v1 = v0 < vmax ? Math.min(vmax, v0 + ACC * dt) : Math.max(vmax, v0 - DEC * dt);
    const ds = ((v0 + v1) / 2) * dt;
    this.speed = v1;

    if (restDue) {
      this.moveBy(a, ds / 1000, dt);
      if (this.speed < MOVING_EPS) {
        this.speed = 0;
        this.phase = "resting";
        this.phaseStart = now;
        this.phaseMs = RULES.mandatoryRestMin * MIN;
        this.ignition = false;
      }
      return;
    }

    if (dist <= ARRIVE_M || ds >= dist) {
      this.moveBy(a, dist / 1000, dt);
      this.arrive(a, target.kind, now);
      return;
    }
    this.moveBy(a, ds / 1000, dt);
  }

  private arrive(a: Active, kind: TargetKind, now: number): void {
    this.speed = 0;
    this.phaseStart = now;
    if (kind === "end") {
      const route = ROUTE_BY_ID[a.trip.routeId];
      this.placeId = route.destinationId;
      this.coord = this.parkedCoord(this.placeId);
      this.phase = "unloading";
      this.phaseMs = a.trip.plannedUnloadMin * MIN;
      this.ignition = false;
    } else if (kind === "checkpoint") {
      const cp = a.cps[a.cpNext++];
      this.phase = "waiting";
      this.phaseMs = cp.waitMs;
      this.waitPlace = cp.placeId;
      this.ignition = true;
    } else {
      this.phase = "stopped";
      this.phaseMs = (a.script.stop?.durMin ?? 10) * MIN;
      a.stopDone = true;
      this.ignition = false;
    }
  }

  // ───────────────────────── Salida ─────────────────────────

  /** Posición de estacionamiento: unos metros (≤ 80 m) alrededor del lugar, fija por vehículo. */
  private parkedCoord(placeId: string): LngLat {
    const p = PLACE_BY_ID[placeId];
    const h = mulberry32(hashStr(`${this.vehicle.id}|${placeId}`));
    const ang = h() * Math.PI * 2;
    const r = 15 + h() * 65;
    const dLat = (r * Math.cos(ang)) / 111_320;
    const dLng = (r * Math.sin(ang)) / (111_320 * Math.cos((p.coord[1] * Math.PI) / 180));
    return [p.coord[0] + dLng, p.coord[1] + dLat];
  }

  telemetry(ts: number, inc: IncidentBook): Telemetry {
    const t: Telemetry = {
      vehicleId: this.vehicle.id,
      ts,
      coord: [Math.round(this.coord[0] * 1e6) / 1e6, Math.round(this.coord[1] * 1e6) / 1e6],
      heading: Math.round(this.heading * 10) / 10,
      speedKmh: Math.round(this.speed * 3.6 * 10) / 10,
      ignition: this.ignition,
      fuelPct: Math.round((this.fuelL / this.vehicle.fuelCapacityL) * 1000) / 10,
      odometerKm: Math.round(this.odometer * 10) / 10,
    };
    if (inc.hasBreakdown(this.vehicle.id)) t.faultCode = BREAKDOWN_FAULT;
    return t;
  }
}
