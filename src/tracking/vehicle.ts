import type { Telemetry } from "@/lib/types";
import { MOVING_KMH, REST_AFTER_DRIVING_MIN, RESET_STOP_MIN } from "./constants";
import { updateEnroute } from "./enroute";
import { inside } from "./geofence";
import type { TripState, VehicleState } from "./state";

/** Conducción continua y detención continua del vehículo (entre viajes también). */
function updateClock(vs: VehicleState, s: Telemetry): void {
  const prev = vs.last;
  const dt = prev ? Math.max(0, (s.ts - prev.ts) / 60000) : 0;
  if (s.speedKmh > MOVING_KMH) {
    vs.cont += dt;
    vs.stopRun = 0;
    vs.stopStart = null;
  } else {
    if (vs.stopStart === null) {
      vs.stopStart = prev ? prev.ts : s.ts;
      vs.restApplicable = vs.cont >= REST_AFTER_DRIVING_MIN;
    }
    vs.stopRun += dt;
    if (vs.stopRun >= RESET_STOP_MIN) vs.cont = 0;
  }
}

/** Momento en que el camión queda disponible en el origen del viaje `i` (-Infinity si no hay dato). */
function availableAt(vs: VehicleState, i: number): number {
  const prev = vs.trips[i - 1];
  let a = -Infinity;
  if (prev && prev.actualArrival !== null) a = prev.actualArrival + prev.trip.plannedUnloadMin * 60000;
  if (i === vs.cur && vs.insideSince !== null) a = Math.max(a, vs.insideSince);
  return a;
}

function closePrevTimeline(vs: VehicleState, at: number): void {
  const prev = vs.trips[vs.cur - 1];
  if (!prev || prev.timeline.length === 0) return;
  const last = prev.timeline[prev.timeline.length - 1];
  if (last.end !== null) return;
  prev.timeline = [...prev.timeline.slice(0, -1), { ...last, end: Math.max(at, last.start) }];
  prev.dirty = true;
}

/** Transiciones de fase del viaje en curso. Es idempotente: se puede llamar varias veces. */
export function advance(vs: VehicleState, now: number): void {
  for (;;) {
    const t: TripState | undefined = vs.trips[vs.cur];
    if (!t) return;
    const last = vs.last;

    if (t.phase === "waiting") {
      if (!last || !inside(t.origin, last.coord)) return;
      const start = Math.max(t.trip.plannedLoadStart, availableAt(vs, vs.cur));
      if (now < start) return;
      t.phase = "loading";
      t.actualLoadStart = start;
      t.timeline = [{ activity: "loading", start, end: null, placeId: t.origin.id }];
      closePrevTimeline(vs, start);
      continue;
    }

    if (t.phase === "loading") {
      if (!last || inside(t.origin, last.coord) || last.speedKmh <= MOVING_KMH) return;
      t.phase = "enroute";
      t.actualDeparture = last.ts;
      t.progressKm = 0;
      t.lastTs = last.ts;
      continue;
    }

    if (t.phase === "enroute") {
      if (!last || !inside(t.dest, last.coord) || t.progressKm < 0.5 * t.route.distanceKm) return;
      t.phase = "unloading";
      t.actualArrival = last.ts;
      t.progressKm = t.route.distanceKm;
      t.frozenCont = vs.cont;
      t.dirty = true;
      continue;
    }

    if (t.phase === "unloading") {
      const end = (t.actualArrival ?? now) + t.trip.plannedUnloadMin * 60000;
      if (now < end) return;
      t.phase = "done";
      t.dirty = true;
      vs.cur++;
      const nx = vs.trips[vs.cur];
      if (nx && last && inside(nx.origin, last.coord)) {
        vs.insideSince = nx.origin.id === t.dest.id ? (t.actualArrival ?? last.ts) : last.ts;
      } else {
        vs.insideSince = null;
      }
      continue;
    }

    return;
  }
}

/** Aplica una muestra de telemetría al vehículo. */
export function applySample(vs: VehicleState, s: Telemetry): void {
  updateClock(vs, s);
  vs.last = s;
  const cur = vs.trips[vs.cur];
  if (cur) {
    if (inside(cur.origin, s.coord)) {
      if (vs.insideSince === null) vs.insideSince = s.ts;
    } else {
      vs.insideSince = null;
    }
  }
  advance(vs, s.ts);
  const t = vs.trips[vs.cur];
  if (t && t.phase === "enroute") updateEnroute(vs, t, s);
  advance(vs, s.ts);
}
