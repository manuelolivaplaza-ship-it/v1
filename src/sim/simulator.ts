import { CORRIDOR_BY_ID, PLACE_BY_ID } from "@/data";
import type { Incident, IncidentRequest, Simulator, TelemetryBatch, Trip } from "@/lib/types";
import { IncidentBook } from "./incidents";
import { mulberry32 } from "./rng";
import { buildDay, localMidnight } from "./scenario";
import { VehicleSim } from "./vehicle";

const MIN = 60_000;
const DEFAULT_SEED = 20260611;
/** Subpaso máximo de integración y paso del precalentamiento (ms simulados). */
const SUBSTEP_MS = 5_000;
const WARM_STEP_MS = 10_000;
const WARM_EMIT_MS = 30_000;
const TICK_MS = 100;
const MAX_REAL_DT_MS = 250;

export function createSimulator(options: { seed?: number; timeScale?: number } = {}): Simulator {
  const seed = options.seed ?? DEFAULT_SEED;
  const { scenario, scripts } = buildDay(seed, localMidnight(new Date()));

  const tripsByVehicle: Record<string, Trip[]> = {};
  for (const t of scenario.trips) (tripsByVehicle[t.vehicleId] ??= []).push(t);
  const sims = scenario.vehicles.map((v) => {
    const trips = (tripsByVehicle[v.id] ?? []).sort((a, b) => a.plannedLoadStart - b.plannedLoadStart);
    return new VehicleSim(v, trips, scripts, seed);
  });

  const incidents = new IncidentBook();
  const pickRng = mulberry32(seed ^ 0x9e3779b9);
  const batchSubs = new Set<(b: TelemetryBatch) => void>();
  const incidentSubs = new Set<(i: Incident[]) => void>();

  // El reloj parte poco antes del primer evento del día.
  const firstEvent = Math.min(scenario.startAt, ...scenario.trips.map((t) => t.plannedLoadStart));
  let clock = Math.floor((firstEvent - 20 * MIN) / WARM_EMIT_MS) * WARM_EMIT_MS;
  let timeScale = Number.isFinite(options.timeScale) && (options.timeScale as number) > 0 ? (options.timeScale as number) : 1;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastReal = 0;
  let disposed = false;

  const notifyIncidents = () => {
    const snapshot = incidents.all();
    incidentSubs.forEach((cb) => cb(snapshot));
  };

  const emit = () => {
    if (!batchSubs.size) return;
    const batch: TelemetryBatch = { now: clock, items: sims.map((s) => s.telemetry(clock, incidents)) };
    batchSubs.forEach((cb) => cb(batch));
  };

  /** Avanza el reloj simulado en subpasos de ≤ 5 s. */
  const advance = (ms: number) => {
    let rem = ms;
    while (rem > 0) {
      const h = Math.min(SUBSTEP_MS, rem);
      clock += h;
      if (incidents.expire(clock)) notifyIncidents();
      for (const s of sims) s.step(h, clock, incidents);
      rem -= h;
    }
  };

  const tick = () => {
    const t = Date.now();
    const dtReal = Math.min(MAX_REAL_DT_MS, Math.max(0, t - lastReal));
    lastReal = t;
    advance(dtReal * timeScale);
    emit();
  };

  const make = (
    kind: Incident["kind"],
    label: string,
    coord: Incident["coord"],
    durationMin: number,
    extra: Partial<Incident> = {},
  ): Incident => ({
    id: incidents.nextId(),
    kind,
    label,
    coord,
    ...extra,
    startedAt: clock,
    endsAt: clock + durationMin * MIN,
  });

  const start = () => {
    if (timer !== null || disposed) return;
    lastReal = Date.now();
    timer = setInterval(tick, TICK_MS);
  };

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  return {
    scenario,

    now: () => clock,
    isRunning: () => timer !== null,
    getTimeScale: () => timeScale,

    setTimeScale(scale) {
      if (Number.isFinite(scale) && scale > 0) timeScale = scale;
    },

    subscribe(cb) {
      batchSubs.add(cb);
      return () => {
        batchSubs.delete(cb);
      };
    },

    start,

    stop,

    warmUp() {
      if (disposed || clock >= scenario.startAt) return;
      emit();
      let lastEmit = clock;
      while (clock < scenario.startAt) {
        advance(Math.min(WARM_STEP_MS, scenario.startAt - clock));
        if (clock - lastEmit >= WARM_EMIT_MS || clock >= scenario.startAt) {
          emit();
          lastEmit = clock;
        }
      }
    },

    injectIncident(req: IncidentRequest) {
      let inc: Incident;
      switch (req.kind) {
        case "congestion": {
          const corridor = (req.corridor && CORRIDOR_BY_ID[req.corridor]) || CORRIDOR_BY_ID["ruta-68"];
          inc = make("congestion", `Taco en ${corridor.name}`, corridor.hotspot, req.durationMin ?? 60, {
            radiusKm: 10,
            corridor: corridor.id,
          });
          break;
        }
        case "breakdown": {
          let v = req.vehicleId ? sims.find((s) => s.vehicle.id === req.vehicleId) : undefined;
          if (!v || !v.isDriving()) {
            const driving = sims.filter((s) => s.isDriving() && !incidents.hasBreakdown(s.vehicle.id));
            v = driving.length ? driving[Math.floor(pickRng() * driving.length)] : (v ?? sims[0]);
          }
          inc = make("breakdown", `Avería ${v.vehicle.unit}`, [v.coord[0], v.coord[1]], req.durationMin ?? 45, {
            vehicleId: v.vehicle.id,
          });
          v.halt();
          break;
        }
        case "border_closure": {
          const place = (req.placeId && PLACE_BY_ID[req.placeId]) || PLACE_BY_ID["paso-libertadores"];
          inc = make("border_closure", `${place.shortName} cerrado`, place.coord, req.durationMin ?? 90, {
            placeId: place.id,
          });
          break;
        }
        default: {
          const place = (req.placeId && PLACE_BY_ID[req.placeId]) || PLACE_BY_ID["puerto-san-antonio"];
          inc = make("port_delay", `Congestión en ${place.name}`, place.coord, req.durationMin ?? 60, {
            placeId: place.id,
          });
        }
      }
      incidents.add(inc);
      notifyIncidents();
      return inc;
    },

    clearIncident(id) {
      if (incidents.remove(id)) notifyIncidents();
    },

    getIncidents: () => incidents.all(),

    subscribeIncidents(cb) {
      incidentSubs.add(cb);
      return () => {
        incidentSubs.delete(cb);
      };
    },

    dispose() {
      stop();
      disposed = true;
      batchSubs.clear();
      incidentSubs.clear();
      incidents.clear();
    },
  };
}
