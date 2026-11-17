/**
 * Contratos compartidos de la plataforma.
 *
 * Regla de arquitectura: el simulador solo produce `Telemetry` (lo mismo que
 * enviaría un GPS real). Todo lo demás —ETA, retrasos, causas, alertas— lo
 * deduce el motor de seguimiento a partir de la telemetría y del plan del viaje.
 * Así el producto funciona igual con camiones simulados y reales.
 *
 * Tiempos: epoch en milisegundos. Durante la demo "ahora" es el reloj simulado
 * (`TelemetryBatch.now`), nunca `Date.now()`.
 */

export type LngLat = [lng: number, lat: number];

// ───────────────────────── Datos maestros ─────────────────────────

export type PlaceKind = "depot" | "port" | "border" | "city";

export interface Place {
  id: string;
  name: string;
  shortName: string;
  kind: PlaceKind;
  coord: LngLat;
  /** Radio de la geocerca del lugar. */
  radiusM: number;
}

export type CorridorId =
  | "ruta-78"
  | "ruta-68"
  | "ruta-57"
  | "paso-libertadores"
  | "ruta-5-sur"
  | "ruta-5-norte";

export interface Corridor {
  id: CorridorId;
  /** "Ruta 68" */
  name: string;
  /** "Santiago – Valparaíso" */
  label: string;
  /** Punto típico de congestión del corredor. */
  hotspot: LngLat;
}

export interface RouteCheckpoint {
  placeId: string;
  /** Distancia desde el origen a la que está el control. */
  km: number;
  /** Espera planificada (aduana). */
  plannedWaitMin: number;
}

export interface RouteDef {
  /** `${originId}__${destinationId}` */
  id: string;
  /** "CD Pudahuel → San Antonio" */
  name: string;
  corridor: CorridorId;
  originId: string;
  destinationId: string;
  distanceKm: number;
  /** Tiempo de conducción de un camión sin tráfico ni paradas. */
  baseDurationMin: number;
  checkpoints: RouteCheckpoint[];
  coordinates: LngLat[];
}

export type TrailerType = "dry_van" | "reefer" | "container" | "flatbed" | "tanker";

export interface Vehicle {
  id: string;
  /** Número interno visible: "T-12". */
  unit: string;
  /** Patente chilena: "KXRT-42". */
  plate: string;
  model: string;
  trailer: TrailerType;
  driver: { name: string; phone: string };
  fuelCapacityL: number;
}

export interface Trip {
  /** "VJ-1042" */
  id: string;
  vehicleId: string;
  routeId: string;
  client: string;
  cargo: { description: string; weightTon: number; waybill: string };
  /** Inicio planificado de la carga en el origen. */
  plannedLoadStart: number;
  plannedLoadMin: number;
  plannedDeparture: number;
  /** Hora comprometida de llegada al destino. */
  committedArrival: number;
  plannedUnloadMin: number;
}

// ───────────────────────── Telemetría (entrada) ─────────────────────────

export interface Telemetry {
  vehicleId: string;
  ts: number;
  coord: LngLat;
  /** Grados, 0 = norte, sentido horario. */
  heading: number;
  speedKmh: number;
  ignition: boolean;
  /** 0–100 */
  fuelPct: number;
  odometerKm: number;
  /** Presente mientras hay una falla mecánica activa, p. ej. "P0217". */
  faultCode?: string;
}

export interface TelemetryBatch {
  /** Reloj de la fuente (simulado en la demo). */
  now: number;
  items: Telemetry[];
}

/** Cualquier origen de posiciones: el simulador hoy, un WebSocket con GPS reales mañana. */
export interface TelemetrySource {
  subscribe(cb: (batch: TelemetryBatch) => void): () => void;
  start(): void;
  stop(): void;
}

// ───────────────────────── Seguimiento (salida) ─────────────────────────

/** Clasificación del viaje respecto de su hora comprometida. */
export type TripStatus = "scheduled" | "on_time" | "at_risk" | "delayed" | "completed";

/** Qué está haciendo el camión ahora. */
export type Activity =
  | "idle" // sin viaje en curso
  | "loading"
  | "driving"
  | "resting" // descanso obligatorio
  | "stopped" // detención no planificada
  | "border_wait"
  | "unloading"
  | "offline"; // sin señal

export type DelayCause =
  | "late_departure"
  | "loading_delay"
  | "congestion"
  | "unplanned_stop"
  | "breakdown"
  | "border_wait";

export interface TimelineSegment {
  activity: Activity;
  start: number;
  /** null = en curso */
  end: number | null;
  placeId?: string;
}

export interface TripProgress {
  tripId: string;
  vehicleId: string;
  status: TripStatus;
  activity: Activity;
  progressKm: number;
  remainingKm: number;
  /** 0–1 */
  progressPct: number;
  /** Llegada estimada; pasa a ser la llegada real cuando el viaje termina. */
  eta: number;
  /** eta − hora comprometida, en minutos. Negativo = adelantado. */
  delayMin: number;
  /** Minutos perdidos por causa, de mayor a menor. Vacío si no hay retraso. */
  causes: { cause: DelayCause; minutes: number }[];
  /** Minutos de conducción continua desde el último descanso. */
  continuousDrivingMin: number;
  /** Minutos que faltan para el descanso obligatorio. */
  restDueInMin: number;
  actualLoadStart: number | null;
  actualDeparture: number | null;
  actualArrival: number | null;
  /** Lo que realmente ocurrió, en orden cronológico. */
  timeline: TimelineSegment[];
  updatedAt: number;
}

export type AlertKind =
  | "at_risk"
  | "delayed"
  | "late_departure"
  | "unplanned_stop"
  | "breakdown"
  | "border_wait"
  | "rest_due"
  | "arrived";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  ts: number;
  kind: AlertKind;
  severity: AlertSeverity;
  vehicleId: string;
  tripId: string;
  /** Texto en español listo para mostrar: "T-12 llegará 25 min tarde". */
  title: string;
  /** "Congestión en Ruta 68 · ETA 14:35". */
  detail: string;
}

export interface TrackerInput {
  vehicles: Vehicle[];
  trips: Trip[];
}

export interface TrackerOutput {
  now: number;
  /** Estado de todos los viajes, por id de viaje. */
  progress: Record<string, TripProgress>;
  /** Viaje a mostrar por vehículo: el que está en curso; si no, el próximo; si no, el último. */
  activeTripByVehicle: Record<string, string | null>;
  /** Alertas nuevas desde la llamada anterior. */
  alerts: Alert[];
}

export interface Tracker {
  ingest(batch: TelemetryBatch): TrackerOutput;
}

// ───────────────────────── Simulador ─────────────────────────

export type IncidentKind = "congestion" | "breakdown" | "border_closure" | "port_delay";

export interface Incident {
  id: string;
  kind: IncidentKind;
  /** "Taco en Ruta 68" */
  label: string;
  /** Dónde dibujarlo en el mapa. */
  coord: LngLat;
  /** Zona afectada (congestión). */
  radiusKm?: number;
  corridor?: CorridorId;
  vehicleId?: string;
  placeId?: string;
  startedAt: number;
  endsAt: number;
}

export interface IncidentRequest {
  kind: IncidentKind;
  /** congestion */
  corridor?: CorridorId;
  /** breakdown */
  vehicleId?: string;
  /** border_closure / port_delay */
  placeId?: string;
  /** Por defecto lo decide el simulador según el tipo. */
  durationMin?: number;
}

export interface Scenario {
  /** 00:00 del día simulado. */
  dayStart: number;
  /** Hora en la que arranca la demo (después del precalentamiento). */
  startAt: number;
  vehicles: Vehicle[];
  trips: Trip[];
}

export interface Simulator extends TelemetrySource {
  readonly scenario: Scenario;
  now(): number;
  /**
   * Simula de forma síncrona desde el inicio del día hasta `scenario.startAt`,
   * emitiendo lotes a los suscriptores, para que la demo arranque con historia.
   */
  warmUp(): void;
  isRunning(): boolean;
  getTimeScale(): number;
  /** 1 = tiempo real, 60 = un minuto simulado por segundo. */
  setTimeScale(scale: number): void;
  injectIncident(req: IncidentRequest): Incident;
  clearIncident(id: string): void;
  getIncidents(): Incident[];
  subscribeIncidents(cb: (incidents: Incident[]) => void): () => void;
  dispose(): void;
}

/** Lo que la interfaz puede hacerle al simulador (lo implementa el runtime). */
export interface SimControls {
  setRunning(running: boolean): void;
  setTimeScale(scale: number): void;
  injectIncident(req: IncidentRequest): void;
  clearIncident(id: string): void;
  /** Reinicia el día simulado desde cero. */
  reset(): void;
}

/** Estado visual único de un camión: decide su color en mapa, listas y paneles. */
export type DisplayState =
  | "on_time"
  | "at_risk"
  | "delayed"
  | "stopped" // detenido sin plan o con avería
  | "offline"
  | "scheduled"
  | "completed"
  | "idle";
