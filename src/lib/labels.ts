import type {
  Activity,
  AlertSeverity,
  DelayCause,
  DisplayState,
  IncidentKind,
  PlaceKind,
  TrailerType,
  TripProgress,
} from "./types";
import { RULES } from "./planning";

/** Estado visual único de un camión. Úsalo siempre para decidir colores. */
export function displayState(p: TripProgress | null | undefined): DisplayState {
  if (!p) return "idle";
  if (p.status === "completed") return "completed";
  if (p.activity === "offline") return "offline";
  if (p.activity === "stopped") return "stopped";
  if (p.status === "scheduled") return "scheduled";
  return p.status;
}

export const STATE_LABEL: Record<DisplayState, string> = {
  on_time: "A tiempo",
  at_risk: "En riesgo",
  delayed: "Retrasado",
  stopped: "Detenido",
  offline: "Sin señal",
  scheduled: "Programado",
  completed: "Completado",
  idle: "Sin viaje",
};

/**
 * Colores en hex para el mapa (Mapbox no lee variables CSS), pensados para fondo claro.
 * Coinciden con los tokens `--ok`, `--warn`, `--late`… de globals.css.
 */
export const STATE_COLOR: Record<DisplayState, string> = {
  on_time: "#1fa971",
  at_risk: "#f5a524",
  delayed: "#e5484d",
  stopped: "#64748b",
  offline: "#9aa3b2",
  scheduled: "#7c8db5",
  completed: "#a1a1aa",
  idle: "#a1a1aa",
};

/**
 * Clases de Tailwind por estado, para tema claro:
 * `text` (legible sobre blanco), `soft` (fondo suave), `dot` (punto o barra sólida).
 */
export const STATE_CLASS: Record<DisplayState, { text: string; soft: string; dot: string }> = {
  on_time: { text: "text-ok-ink", soft: "bg-ok-soft", dot: "bg-ok" },
  at_risk: { text: "text-warn-ink", soft: "bg-warn-soft", dot: "bg-warn" },
  delayed: { text: "text-late-ink", soft: "bg-late-soft", dot: "bg-late" },
  stopped: { text: "text-halt-ink", soft: "bg-halt-soft", dot: "bg-halt" },
  offline: { text: "text-muted-foreground", soft: "bg-muted", dot: "bg-muted-foreground/60" },
  scheduled: { text: "text-sched-ink", soft: "bg-sched-soft", dot: "bg-sched" },
  completed: { text: "text-muted-foreground", soft: "bg-muted", dot: "bg-muted-foreground/60" },
  idle: { text: "text-muted-foreground", soft: "bg-muted", dot: "bg-muted-foreground/60" },
};

export const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: "Sin viaje",
  loading: "Cargando",
  driving: "En ruta",
  resting: "Descanso obligatorio",
  stopped: "Detención no planificada",
  border_wait: "En aduana",
  unloading: "Descargando",
  offline: "Sin señal",
};

export const CAUSE_LABEL: Record<DelayCause, string> = {
  late_departure: "Salida tardía",
  loading_delay: "Espera en la carga",
  congestion: "Congestión",
  unplanned_stop: "Parada no planificada",
  breakdown: "Avería",
  border_wait: "Espera en aduana",
};

export const INCIDENT_LABEL: Record<IncidentKind, string> = {
  congestion: "Congestión",
  breakdown: "Avería",
  border_closure: "Cierre de paso fronterizo",
  port_delay: "Espera en puerto",
};

export const TRAILER_LABEL: Record<TrailerType, string> = {
  dry_van: "Caja seca",
  reefer: "Refrigerado",
  container: "Portacontenedor",
  flatbed: "Plataforma",
  tanker: "Cisterna",
};

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  depot: "Centro de distribución",
  port: "Puerto",
  border: "Paso fronterizo",
  city: "Ciudad",
};

export const SEVERITY_CLASS: Record<AlertSeverity, { text: string; soft: string; dot: string }> = {
  info: { text: "text-info-ink", soft: "bg-info-soft", dot: "bg-info" },
  warning: { text: "text-warn-ink", soft: "bg-warn-soft", dot: "bg-warn" },
  critical: { text: "text-late-ink", soft: "bg-late-soft", dot: "bg-late" },
};

// ───────────────────────── Formato ─────────────────────────

const clock = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "14:35" */
export function formatClock(ts: number): string {
  return clock.format(ts);
}

/** "2 h 15 min", "45 min" */
export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "+38 min", "−12 min", "a tiempo" (dentro de la tolerancia). */
export function formatDelay(delayMin: number): string {
  const m = Math.round(delayMin);
  if (Math.abs(m) < RULES.toleranceMin) return "a tiempo";
  const abs = Math.abs(m);
  const body = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h ${abs % 60 ? `${abs % 60} min` : ""}`.trim();
  return `${m > 0 ? "+" : "−"}${body}`;
}

/** "118 km", "4,2 km" */
export function formatKm(km: number): string {
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1).replace(".", ",")} km`;
}

/**
 * Orden del tablero: lo que más urge primero.
 * Retrasados, detenidos, en riesgo, a tiempo, programados, completados.
 */
const STATE_RANK: Record<DisplayState, number> = {
  delayed: 0,
  stopped: 1,
  offline: 2,
  at_risk: 3,
  on_time: 4,
  scheduled: 5,
  completed: 6,
  idle: 7,
};

export function compareByRisk(a: TripProgress | null, b: TripProgress | null): number {
  const sa = displayState(a);
  const sb = displayState(b);
  if (sa !== sb) return STATE_RANK[sa] - STATE_RANK[sb];
  return (b?.delayMin ?? -Infinity) - (a?.delayMin ?? -Infinity);
}
