import type { Activity, DelayCause, TimelineSegment, TripProgress } from "@/lib/types";
import { RULES } from "@/lib/planning";
import { MIN_CAUSE_MIN } from "./constants";
import { computeStatus, forecast, type Forecast } from "./forecast";
import type { TripState, VehicleState } from "./state";

/** Agrega un segmento al cambiar la actividad (sin tocar el arreglo si no cambió). */
function syncTimeline(vs: VehicleState, t: TripState, activity: Activity, now: number): void {
  if (t.actualLoadStart === null) return;
  const tl = t.timeline;
  const last = tl[tl.length - 1];
  if (last && last.activity === activity) return;

  const lastTs = vs.last ? vs.last.ts : now;
  let at: number;
  if (!last) at = t.actualLoadStart;
  else if (last.activity === "loading" && t.phase !== "loading" && t.actualDeparture !== null) at = t.actualDeparture;
  else if (activity === "unloading") at = t.actualArrival ?? lastTs;
  else if (activity === "idle") at = (t.actualArrival ?? lastTs) + t.trip.plannedUnloadMin * 60000;
  else if (activity === "stopped" || activity === "resting") at = vs.stopStart ?? lastTs;
  else at = lastTs;
  if (last) at = Math.max(at, last.start);

  let placeId: string | undefined;
  if (activity === "loading") placeId = t.origin.id;
  else if (activity === "unloading") placeId = t.dest.id;
  else if (activity === "border_wait") placeId = t.insideCp ?? undefined;

  const seg: TimelineSegment = { activity, start: at, end: null };
  if (placeId) seg.placeId = placeId;
  t.timeline = last ? [...tl.slice(0, -1), { ...last, end: at }, seg] : [seg];
}

/** Retraso en la salida repartido entre salida tardía y espera en la carga. */
export function departureCauses(t: TripState, f: Forecast, now: number): { late: number; loading: number } {
  const trip = t.trip;
  let delay: number;
  if (t.actualDeparture !== null) delay = (t.actualDeparture - trip.plannedDeparture) / 60000;
  else if (t.phase === "loading") delay = (now - trip.plannedDeparture) / 60000;
  else delay = ((f.departure ?? now) - trip.plannedDeparture) / 60000;
  delay = Math.max(0, delay);
  const ls = t.actualLoadStart ?? f.loadStart ?? trip.plannedLoadStart;
  const lateStart = Math.max(0, (ls - trip.plannedLoadStart) / 60000);
  const late = Math.min(delay, lateStart);
  return { late, loading: delay - late };
}

function buildCauses(t: TripState, dep: { late: number; loading: number }): TripProgress["causes"] {
  const all: Record<DelayCause, number> = { ...t.lost };
  all.late_departure += dep.late;
  all.loading_delay += dep.loading;
  const out: TripProgress["causes"] = [];
  for (const k of Object.keys(all) as DelayCause[]) {
    if (all[k] >= MIN_CAUSE_MIN) out.push({ cause: k, minutes: all[k] });
  }
  return out.sort((a, b) => b.minutes - a.minutes);
}

function sameProgress(a: TripProgress, b: TripProgress): boolean {
  if (
    a.status !== b.status ||
    a.activity !== b.activity ||
    a.progressKm !== b.progressKm ||
    a.remainingKm !== b.remainingKm ||
    a.progressPct !== b.progressPct ||
    a.eta !== b.eta ||
    a.delayMin !== b.delayMin ||
    a.continuousDrivingMin !== b.continuousDrivingMin ||
    a.restDueInMin !== b.restDueInMin ||
    a.actualLoadStart !== b.actualLoadStart ||
    a.actualDeparture !== b.actualDeparture ||
    a.actualArrival !== b.actualArrival ||
    a.timeline !== b.timeline ||
    a.causes.length !== b.causes.length
  ) {
    return false;
  }
  for (let i = 0; i < a.causes.length; i++) {
    if (a.causes[i].cause !== b.causes[i].cause || a.causes[i].minutes !== b.causes[i].minutes) return false;
  }
  return true;
}

export interface BuiltProgress {
  progress: TripProgress;
  forecast: Forecast;
}

/** Calcula el TripProgress del viaje `i`; reutiliza el objeto anterior si nada cambió. */
export function buildProgress(vs: VehicleState, i: number, now: number, offline: boolean): BuiltProgress {
  const t = vs.trips[i];
  const trip = t.trip;
  const f = forecast(vs, i, now);
  t.eta = f.eta;

  const finished = t.phase === "unloading" || t.phase === "done";
  const delayMin = (f.eta - trip.committedArrival) / 60000;
  let status: TripProgress["status"];
  if (finished) status = "completed";
  else {
    const bestDelay = (f.bestEta - trip.committedArrival) / 60000;
    status = computeStatus(t.status, now, trip.committedArrival, delayMin, bestDelay, t.actualLoadStart !== null);
  }
  t.status = status;

  let activity: Activity;
  switch (t.phase) {
    case "loading":
      activity = "loading";
      break;
    case "enroute":
      activity = t.raw;
      break;
    case "unloading":
      activity = "unloading";
      break;
    default:
      activity = "idle";
  }
  if (offline && i === vs.cur) activity = "offline";
  syncTimeline(vs, t, activity, now);

  const dist = t.route.distanceKm;
  const progressKm = t.phase === "enroute" || finished ? Math.min(dist, t.progressKm) : 0;
  const cont = finished ? t.frozenCont : vs.cont;

  const next: TripProgress = {
    tripId: trip.id,
    vehicleId: trip.vehicleId,
    status,
    activity,
    progressKm,
    remainingKm: Math.max(0, dist - progressKm),
    progressPct: dist > 0 ? Math.min(1, progressKm / dist) : 0,
    eta: f.eta,
    delayMin,
    causes: buildCauses(t, departureCauses(t, f, now)),
    continuousDrivingMin: cont,
    restDueInMin: Math.max(0, RULES.maxContinuousDrivingMin - cont),
    actualLoadStart: t.actualLoadStart,
    actualDeparture: t.actualDeparture,
    actualArrival: t.actualArrival,
    timeline: t.timeline,
    updatedAt: now,
  };

  if (t.cache && sameProgress(t.cache, next)) return { progress: t.cache, forecast: f };
  t.cache = next;
  return { progress: next, forecast: f };
}
