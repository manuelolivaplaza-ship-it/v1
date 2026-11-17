import { projectToRoute } from "@/lib/geo";
import { RULES } from "@/lib/planning";
import type { Activity, Telemetry } from "@/lib/types";
import { CROSSING_KMH, MOVING_KMH, SLOW_AFTER_MIN, SLOW_FACTOR } from "./constants";
import { inAnyPlace, inside } from "./geofence";
import type { TripState, VehicleState } from "./state";

/**
 * Actualiza avance, actividad en ruta y minutos perdidos de un viaje en ruta
 * con una muestra nueva. El reloj del vehículo ya se actualizó.
 */
export function updateEnroute(vs: VehicleState, t: TripState, s: Telemetry): void {
  const dtMin = t.lastTs === null ? 0 : Math.max(0, (s.ts - t.lastTs) / 60000);
  t.lastTs = s.ts;

  // Avance: nunca retrocede; la ventana de búsqueda crece con los saltos de tiempo.
  const hint = t.progressKm;
  const win = Math.min(150, Math.max(15, dtMin * 2.5 + 5));
  const proj = projectToRoute(t.idx, s.coord, hint, win);
  const km = Math.min(t.route.distanceKm, Math.max(hint, proj.km));
  const dKm = km - hint;
  t.progressKm = km;

  const moving = s.speedKmh > MOVING_KMH;
  const fault = !!s.faultCode;

  let here = null as TripState["checkpoints"][number] | null;
  for (const c of t.checkpoints) {
    if (inside(c.place, s.coord)) {
      here = c;
      break;
    }
  }
  t.insideCp = here ? here.place.id : null;
  if (here) t.visited.add(here.place.id);

  let act: Activity;
  if (!moving && fault) act = "stopped";
  else if (!moving && !s.ignition && vs.restApplicable) act = "resting";
  else if (here && s.speedKmh <= CROSSING_KMH) act = "border_wait";
  else if (!moving && vs.stopRun > RULES.unplannedStopAfterMin && !inAnyPlace(s.coord)) act = "stopped";
  else act = "driving";
  t.raw = act;
  t.rawFault = act === "stopped" && fault;

  if (dtMin <= 0) return;

  // Minutos perdidos respecto del plan; solo lo positivo se asigna a una causa.
  const L = Math.max(0, dtMin - dKm / t.vplan);

  if (act === "stopped") {
    t.lost[fault ? "breakdown" : "unplanned_stop"] += L + t.pendingStationary;
    t.pendingStationary = 0;
    t.slowRun = 0;
    t.slowPending = 0;
  } else if (act === "resting") {
    t.pendingStationary = 0;
    t.slowRun = 0;
    t.slowPending = 0;
  } else if (act === "border_wait" && here) {
    const id = here.place.id;
    const before = t.bw[id] ?? 0;
    const after = before + dtMin;
    t.bw[id] = after;
    const planned = here.cp.plannedWaitMin;
    t.lost.border_wait += Math.max(0, after - planned) - Math.max(0, before - planned);
    t.pendingStationary = 0;
    t.slowRun = 0;
    t.slowPending = 0;
  } else if (!moving) {
    // Detenido hace poco: se asigna solo si se vuelve detención no planificada.
    t.pendingStationary += L;
  } else {
    t.pendingStationary = 0;
    if (s.speedKmh < SLOW_FACTOR * t.vplan * 60) {
      t.slowRun += dtMin;
      t.slowPending += L;
      if (t.slowRun > SLOW_AFTER_MIN) {
        t.lost.congestion += t.slowPending;
        t.slowPending = 0;
      }
    } else {
      t.slowRun = 0;
      t.slowPending = 0;
    }
  }
}
