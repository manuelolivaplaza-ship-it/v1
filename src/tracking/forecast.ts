import { RULES, remainingMinutes } from "@/lib/planning";
import type { TripStatus } from "@/lib/types";
import { BREAKDOWN_FIX_MIN, HYSTERESIS_MIN, REST_MIN, RESET_STOP_MIN } from "./constants";
import { inside } from "./geofence";
import type { TripState, VehicleState } from "./state";

export interface Forecast {
  eta: number;
  /** Llegada en el mejor caso realista. */
  bestEta: number;
  /** Carga (real o esperada); null una vez que el viaje salió. */
  loadStart: number | null;
  /** Salida (real o esperada). */
  departure: number | null;
}

/** Ajuste a los minutos de checkpoints que cuenta `remainingMinutes`, según lo ya vivido. */
function checkpointAdjust(t: TripState): number {
  let adj = 0;
  for (const c of t.checkpoints) {
    const planned = c.cp.plannedWaitMin;
    const counted = c.cp.km > t.progressKm + 0.5 ? planned : 0;
    const id = c.place.id;
    let desired: number;
    if (t.insideCp === id) desired = Math.max(0, planned - (t.bw[id] ?? 0));
    else if (t.visited.has(id)) desired = 0;
    else desired = counted;
    adj += desired - counted;
  }
  return adj;
}

/** Cuándo quedará disponible el camión en el origen del viaje `i` (viaje aún sin cargar). */
function expectedAvailable(vs: VehicleState, i: number, now: number): number {
  const t = vs.trips[i];
  const prev = vs.trips[i - 1];
  let a = -Infinity;
  if (prev) a = prev.eta + prev.trip.plannedUnloadMin * 60000;
  if (i === vs.cur) {
    if (vs.insideSince !== null) a = Math.max(a, vs.insideSince);
    else if (!vs.last || !inside(t.origin, vs.last.coord)) a = Math.max(a, now);
  }
  return a;
}

export function forecast(vs: VehicleState, i: number, now: number): Forecast {
  const t = vs.trips[i];

  if (t.phase === "unloading" || t.phase === "done") {
    const at = t.actualArrival ?? now;
    return { eta: at, bestEta: at, loadStart: null, departure: null };
  }

  if (t.phase === "enroute") {
    let cont = vs.cont;
    let extra = 0;
    if (t.raw === "resting") {
      extra = Math.max(0, REST_MIN - vs.stopRun);
      cont = 0;
    } else if (t.raw === "stopped" && t.rawFault) {
      extra = Math.max(0, BREAKDOWN_FIX_MIN - vs.stopRun);
    }
    const adj = checkpointAdjust(t);
    const at = (factor: number) =>
      now + Math.max(0, remainingMinutes(t.route, t.progressKm, cont, factor) + adj + extra) * 60000;
    return { eta: at(1), bestEta: at(RULES.bestCaseSpeedFactor), loadStart: null, departure: null };
  }

  // waiting / loading: aún en el origen
  const trip = t.trip;
  const loadStart =
    t.actualLoadStart !== null ? t.actualLoadStart : Math.max(trip.plannedLoadStart, expectedAvailable(vs, i, now));
  const departure = Math.max(now, trip.plannedDeparture, loadStart + trip.plannedLoadMin * 60000);
  let cont = 0;
  if (i === vs.cur) {
    cont = vs.cont;
    if (vs.stopStart !== null && vs.stopRun + (departure - now) / 60000 >= RESET_STOP_MIN) cont = 0;
  }
  return {
    eta: departure + remainingMinutes(t.route, 0, cont) * 60000,
    bestEta: departure + remainingMinutes(t.route, 0, cont, RULES.bestCaseSpeedFactor) * 60000,
    loadStart,
    departure,
  };
}

/** Estado con histéresis de 2 min respecto del estado anterior. */
export function computeStatus(
  prev: TripStatus | null,
  now: number,
  committed: number,
  delayMin: number,
  bestDelayMin: number,
  loadStarted: boolean,
): TripStatus {
  const tol = RULES.toleranceMin;
  const delayedTol = prev === "delayed" ? tol - HYSTERESIS_MIN : tol;
  if (now > committed || bestDelayMin > delayedTol) return "delayed";
  const riskTol = prev === "delayed" || prev === "at_risk" ? tol - HYSTERESIS_MIN : tol;
  if (delayMin > riskTol) return "at_risk";
  return loadStarted ? "on_time" : "scheduled";
}
