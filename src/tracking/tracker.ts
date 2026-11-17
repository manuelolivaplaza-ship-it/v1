import { PLACE_BY_ID, ROUTE_BY_ID } from "@/data";
import { getRouteIndex } from "@/lib/geo";
import { RULES } from "@/lib/planning";
import type { Alert, DelayCause, Tracker, TrackerInput, TrackerOutput, Trip, TripProgress } from "@/lib/types";
import { collectAlerts } from "./alerts";
import { buildProgress } from "./progress";
import type { TripState, VehicleState } from "./state";
import { advance, applySample } from "./vehicle";

function newTripState(trip: Trip): TripState | null {
  const route = ROUTE_BY_ID[trip.routeId];
  if (!route) return null;
  const origin = PLACE_BY_ID[route.originId];
  const dest = PLACE_BY_ID[route.destinationId];
  if (!origin || !dest) return null;
  const lost: Record<DelayCause, number> = {
    late_departure: 0,
    loading_delay: 0,
    congestion: 0,
    unplanned_stop: 0,
    breakdown: 0,
    border_wait: 0,
  };
  return {
    trip,
    route,
    idx: getRouteIndex(route.id),
    origin,
    dest,
    checkpoints: route.checkpoints.flatMap((cp) => {
      const place = PLACE_BY_ID[cp.placeId];
      return place ? [{ cp, place }] : [];
    }),
    vplan: route.distanceKm / route.baseDurationMin,
    phase: "waiting",
    actualLoadStart: null,
    actualDeparture: null,
    actualArrival: null,
    progressKm: 0,
    lastTs: null,
    raw: "driving",
    rawFault: false,
    insideCp: null,
    visited: new Set(),
    bw: {},
    lost,
    pendingStationary: 0,
    slowRun: 0,
    slowPending: 0,
    timeline: [],
    frozenCont: 0,
    status: null,
    emitted: new Set(),
    eta: trip.committedArrival,
    cache: null,
    dirty: false,
  };
}

export function createTracker(input: TrackerInput): Tracker {
  const byVehicle = new Map<string, VehicleState>();
  const order: VehicleState[] = [];

  for (const vehicle of input.vehicles) {
    const vs: VehicleState = {
      vehicle,
      trips: [],
      cur: 0,
      last: null,
      cont: 0,
      stopRun: 0,
      stopStart: null,
      restApplicable: false,
      insideSince: null,
    };
    byVehicle.set(vehicle.id, vs);
    order.push(vs);
  }
  const sorted = [...input.trips].sort((a, b) => a.plannedLoadStart - b.plannedLoadStart);
  for (const trip of sorted) {
    const vs = byVehicle.get(trip.vehicleId);
    const ts = vs && newTripState(trip);
    if (vs && ts) vs.trips.push(ts);
  }

  return {
    ingest(batch): TrackerOutput {
      const now = batch.now;
      const alerts: Alert[] = [];

      for (const s of batch.items) {
        const vs = byVehicle.get(s.vehicleId);
        if (!vs || (vs.last && s.ts < vs.last.ts)) continue;
        applySample(vs, s);
      }

      const progress: Record<string, TripProgress> = {};
      const active: Record<string, string | null> = {};

      for (const vs of order) {
        advance(vs, now);
        const offline = vs.last !== null && now - vs.last.ts > RULES.offlineAfterMin * 60000;

        for (let i = 0; i < vs.trips.length; i++) {
          const t = vs.trips[i];
          if (t.phase === "done" && !t.dirty && t.cache) {
            progress[t.trip.id] = t.cache;
            continue;
          }
          const built = buildProgress(vs, i, now, offline);
          t.dirty = false;
          progress[t.trip.id] = built.progress;
          collectAlerts(vs, i, built.progress, now, offline, alerts);
        }

        if (vs.trips.length === 0) active[vs.vehicle.id] = null;
        else if (vs.cur < vs.trips.length) active[vs.vehicle.id] = vs.trips[vs.cur].trip.id;
        else active[vs.vehicle.id] = vs.trips[vs.trips.length - 1].trip.id;
      }

      return { now, progress, activeTripByVehicle: active, alerts };
    },
  };
}
