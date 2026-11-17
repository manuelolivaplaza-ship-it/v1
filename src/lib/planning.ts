import type { RouteDef } from "./types";

/**
 * Reglas de planificación. El simulador las usa para armar los viajes y el motor
 * de seguimiento para estimar la llegada: deben salir de aquí y de ningún otro lado,
 * o un viaje sin incidentes aparecería atrasado.
 */
export const RULES = {
  /** Conducción continua máxima antes del descanso obligatorio. */
  maxContinuousDrivingMin: 300,
  /** Duración del descanso obligatorio. */
  mandatoryRestMin: 120,
  /** Holgura que se suma al plan para fijar la hora comprometida. */
  bufferPct: 0.12,
  minBufferMin: 15,
  /** Un retraso previsto menor que esto cuenta como "a tiempo". */
  toleranceMin: 5,
  /** Mejor caso realista: conducir un poco más rápido que el plan. */
  bestCaseSpeedFactor: 0.93,
  /** Parado fuera de un lugar previsto por más de esto = detención no planificada. */
  unplannedStopAfterMin: 6,
  /** Sin telemetría por más de esto = sin señal. */
  offlineAfterMin: 10,
  /** Avisar del descanso obligatorio cuando falte esto o menos. */
  restWarningMin: 30,
} as const;

export interface RoutePlan {
  drivingMin: number;
  restStops: number;
  restMin: number;
  checkpointMin: number;
  /** Conducción + descansos + controles, sin holgura. */
  totalMin: number;
  bufferMin: number;
}

/** Descansos obligatorios que exige un tramo de conducción, partiendo descansado o no. */
export function restStopsFor(drivingMin: number, alreadyDrivenMin = 0): number {
  const total = alreadyDrivenMin + drivingMin;
  return Math.max(0, Math.ceil(total / RULES.maxContinuousDrivingMin) - 1);
}

/** Plan de un viaje completo sobre la ruta. */
export function planRoute(route: RouteDef): RoutePlan {
  const drivingMin = route.baseDurationMin;
  const restStops = restStopsFor(drivingMin);
  const restMin = restStops * RULES.mandatoryRestMin;
  const checkpointMin = route.checkpoints.reduce((s, c) => s + c.plannedWaitMin, 0);
  const totalMin = drivingMin + restMin + checkpointMin;
  const bufferMin = Math.max(RULES.minBufferMin, Math.round(totalMin * RULES.bufferPct));
  return { drivingMin, restStops, restMin, checkpointMin, totalMin, bufferMin };
}

/** Hora comprometida de llegada para una salida planificada. */
export function committedArrivalFor(route: RouteDef, plannedDeparture: number): number {
  const plan = planRoute(route);
  return plannedDeparture + (plan.totalMin + plan.bufferMin) * 60_000;
}

/**
 * Minutos que faltan para llegar desde `progressKm`, con el mismo modelo del plan.
 * `speedFactor` escala el tiempo de conducción (1 = plan, >1 = más lento por congestión).
 */
export function remainingMinutes(
  route: RouteDef,
  progressKm: number,
  continuousDrivingMin: number,
  speedFactor = 1,
): number {
  const remainingKm = Math.max(0, route.distanceKm - progressKm);
  const drivingMin = route.baseDurationMin * (remainingKm / route.distanceKm) * speedFactor;
  const restMin = restStopsFor(drivingMin, continuousDrivingMin) * RULES.mandatoryRestMin;
  const checkpointMin = route.checkpoints
    .filter((c) => c.km > progressKm + 0.5)
    .reduce((s, c) => s + c.plannedWaitMin, 0);
  return drivingMin + restMin + checkpointMin;
}
