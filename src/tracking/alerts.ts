import { CAUSE_LABEL, formatClock, formatDelay, formatDuration } from "@/lib/labels";
import { RULES } from "@/lib/planning";
import type { Alert, AlertKind, AlertSeverity, TripProgress } from "@/lib/types";
import { PLACE_BY_ID } from "@/data";
import { LATE_DEPARTURE_ALERT_MIN } from "./constants";
import type { TripState, VehicleState } from "./state";

/** Genera las alertas nuevas de un viaje (una por viaje y tipo). */
export function collectAlerts(
  vs: VehicleState,
  i: number,
  p: TripProgress,
  now: number,
  offline: boolean,
  out: Alert[],
): void {
  const t = vs.trips[i];
  const unit = vs.vehicle.unit;
  const topCause = p.causes.length ? CAUSE_LABEL[p.causes[0].cause] : null;

  const emit = (kind: AlertKind, severity: AlertSeverity, title: string, detail: string) => {
    if (t.emitted.has(kind)) return;
    t.emitted.add(kind);
    out.push({
      id: `${t.trip.id}:${kind}`,
      ts: now,
      kind,
      severity,
      vehicleId: vs.vehicle.id,
      tripId: t.trip.id,
      title,
      detail,
    });
  };

  if (p.status === "completed") {
    if (t.actualArrival === null) return;
    const late = Math.round(p.delayMin);
    const detail = p.delayMin <= RULES.toleranceMin ? "A tiempo" : `${late} min tarde`;
    emit("arrived", "info", `${unit} llegó a ${t.dest.shortName}`, detail);
    return;
  }

  if (p.status === "at_risk") {
    const parts = [`Llegaría ${formatClock(p.eta)} (${formatDelay(p.delayMin)})`];
    if (topCause) parts.push(topCause);
    emit("at_risk", "warning", `${unit} en riesgo de retraso`, parts.join(" · "));
  } else if (p.status === "delayed") {
    const d = formatDelay(p.delayMin);
    const parts = [d === "a tiempo" ? "Superó la hora comprometida" : d];
    if (topCause) parts.push(topCause);
    parts.push(`ETA ${formatClock(p.eta)}`);
    emit("delayed", "critical", `${unit} va retrasado`, parts.join(" · "));
  }

  // Eventos del viaje en curso
  if (i !== vs.cur || offline) return;
  emitEvents(vs, t, p, unit, emit);
}

function emitEvents(
  vs: VehicleState,
  t: TripState,
  p: TripProgress,
  unit: string,
  emit: (kind: AlertKind, severity: AlertSeverity, title: string, detail: string) => void,
): void {
  if (t.actualDeparture !== null) {
    const late = (t.actualDeparture - t.trip.plannedDeparture) / 60000;
    if (late > LATE_DEPARTURE_ALERT_MIN) {
      const cause = p.causes.find((c) => c.cause === "late_departure" || c.cause === "loading_delay");
      const parts = [
        `Salida prevista ${formatClock(t.trip.plannedDeparture)}, real ${formatClock(t.actualDeparture)}`,
      ];
      if (cause) parts.push(CAUSE_LABEL[cause.cause]);
      emit("late_departure", "warning", `${unit} salió ${Math.round(late)} min tarde`, parts.join(" · "));
    }
  }

  if (t.phase !== "enroute") return;

  if (t.raw === "stopped") {
    const stopped = formatDuration(vs.stopRun);
    if (t.rawFault) {
      emit(
        "breakdown",
        "critical",
        `${unit} reporta una avería`,
        `Código ${vs.last?.faultCode ?? "s/i"} · detenido hace ${stopped} · km ${Math.round(t.progressKm)}`,
      );
    } else {
      emit(
        "unplanned_stop",
        "warning",
        `${unit} detenido sin motivo planificado`,
        `Lleva ${stopped} detenido en el km ${Math.round(t.progressKm)}`,
      );
    }
  }

  if (t.raw === "border_wait" && t.insideCp) {
    const cpRef = t.checkpoints.find((c) => c.place.id === t.insideCp);
    const waited = t.bw[t.insideCp] ?? 0;
    if (cpRef && waited > cpRef.cp.plannedWaitMin) {
      const name = PLACE_BY_ID[t.insideCp]?.shortName ?? cpRef.place.shortName;
      emit(
        "border_wait",
        "warning",
        `${unit} espera más de lo previsto en ${name}`,
        `${formatDuration(waited)} de espera, el plan era ${formatDuration(cpRef.cp.plannedWaitMin)}`,
      );
    }
  }

  if (t.raw === "driving" && p.restDueInMin <= RULES.restWarningMin) {
    // Solo avisa si lo que falta por conducir realmente supera el margen
    const remainingDriving = t.route.baseDurationMin * (p.remainingKm / t.route.distanceKm);
    if (remainingDriving > p.restDueInMin) {
      emit(
        "rest_due",
        "info",
        `${unit} debe descansar pronto`,
        `Descanso obligatorio en ${formatDuration(p.restDueInMin)} · ${formatDuration(p.continuousDrivingMin)} de conducción continua`,
      );
    }
  }
}
