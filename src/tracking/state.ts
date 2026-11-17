import type { RouteIndex } from "@/lib/geo";
import type {
  Activity,
  AlertKind,
  DelayCause,
  Place,
  RouteCheckpoint,
  RouteDef,
  Telemetry,
  TimelineSegment,
  Trip,
  TripProgress,
  TripStatus,
  Vehicle,
} from "@/lib/types";

export type Phase = "waiting" | "loading" | "enroute" | "unloading" | "done";

export interface CheckpointRef {
  cp: RouteCheckpoint;
  place: Place;
}

/** Estado interno de un viaje (mutable, vive dentro del tracker). */
export interface TripState {
  trip: Trip;
  route: RouteDef;
  idx: RouteIndex;
  origin: Place;
  dest: Place;
  checkpoints: CheckpointRef[];
  /** Velocidad planificada de la ruta, km/min. */
  vplan: number;
  phase: Phase;
  actualLoadStart: number | null;
  actualDeparture: number | null;
  actualArrival: number | null;
  progressKm: number;
  /** Último instante acumulado en ruta. */
  lastTs: number | null;
  /** Actividad en ruta según la última muestra. */
  raw: Activity;
  rawFault: boolean;
  /** Checkpoint cuya geocerca contiene al camión ahora. */
  insideCp: string | null;
  visited: Set<string>;
  /** Minutos en espera por checkpoint. */
  bw: Record<string, number>;
  /** Minutos perdidos en ruta por causa (late_departure y loading_delay se derivan aparte). */
  lost: Record<DelayCause, number>;
  pendingStationary: number;
  slowRun: number;
  slowPending: number;
  timeline: TimelineSegment[];
  frozenCont: number;
  status: TripStatus | null;
  emitted: Set<AlertKind>;
  /** Última ETA calculada (la usa el viaje siguiente del mismo camión). */
  eta: number;
  cache: TripProgress | null;
  /** Fuerza reconstruir un viaje ya terminado. */
  dirty: boolean;
}

export interface VehicleState {
  vehicle: Vehicle;
  trips: TripState[];
  /** Índice del primer viaje no terminado. */
  cur: number;
  last: Telemetry | null;
  /** Conducción continua, minutos. */
  cont: number;
  /** Minutos de detención continua. */
  stopRun: number;
  stopStart: number | null;
  /** Al comenzar la detención ya correspondía descanso. */
  restApplicable: boolean;
  /** Desde cuándo está dentro de la geocerca del origen del viaje en curso. */
  insideSince: number | null;
}
