"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { compareByRisk, displayState } from "./labels";
import type {
  Alert,
  DisplayState,
  Incident,
  SimControls,
  Telemetry,
  Trip,
  TripProgress,
  Vehicle,
} from "./types";

export type SidebarSection = "trips" | "fleet" | "alerts" | "simulator";

export const TIME_SCALES = [1, 10, 30, 60, 120] as const;
export const DEFAULT_TIME_SCALE = 30;

/**
 * Medidas del layout. La barra lateral (shadcn Sidebar, variante "inset") queda FUERA del mapa:
 * el mapa vive dentro de una tarjeta con borde a su derecha. Sobre el mapa solo flotan el panel
 * de detalle (a la derecha, cuando hay un camión seleccionado), los controles y la barra de tiempo.
 */
export const LAYOUT = {
  /** Ancho de la barra lateral, para `--sidebar-width` del SidebarProvider. */
  sidebarWidth: "22rem",
  /** Ancho en px del panel de detalle que flota sobre el mapa. */
  detailW: 392,
  /** Separación en px entre elementos flotantes y el borde de la tarjeta del mapa. */
  gap: 12,
} as const;

export interface FleetState {
  /** false hasta que el runtime terminó de precalentar el simulador. */
  ready: boolean;
  /** Reloj simulado (epoch ms). Usar siempre esto, nunca Date.now(). */
  now: number;
  dayStart: number;

  vehicles: Record<string, Vehicle>;
  trips: Record<string, Trip>;
  /** Última posición conocida por vehículo. Se actualiza ~10 veces por segundo. */
  telemetry: Record<string, Telemetry>;
  /** Estado de cada viaje, por id de viaje. Se actualiza ~4 veces por segundo. */
  progress: Record<string, TripProgress>;
  activeTripByVehicle: Record<string, string | null>;
  /** Más recientes primero. */
  alerts: Alert[];
  unreadAlerts: number;

  incidents: Incident[];
  sim: { running: boolean; timeScale: number };
  /** Acciones sobre el simulador; null hasta que `ready`. */
  controls: SimControls | null;

  // ── Estado de interfaz ──
  selectedVehicleId: string | null;
  /** La cámara sigue al camión seleccionado. */
  followSelected: boolean;
  hoveredVehicleId: string | null;
  sidebarOpen: boolean;
  section: SidebarSection;

  selectVehicle(id: string | null, opts?: { follow?: boolean }): void;
  setFollow(follow: boolean): void;
  setHovered(id: string | null): void;
  setSidebarOpen(open: boolean): void;
  setSection(section: SidebarSection): void;
  markAlertsRead(): void;
}

export const useFleetStore = create<FleetState>()((set) => ({
  ready: false,
  now: 0,
  dayStart: 0,
  vehicles: {},
  trips: {},
  telemetry: {},
  progress: {},
  activeTripByVehicle: {},
  alerts: [],
  unreadAlerts: 0,
  incidents: [],
  sim: { running: false, timeScale: DEFAULT_TIME_SCALE },
  controls: null,

  selectedVehicleId: null,
  followSelected: false,
  hoveredVehicleId: null,
  sidebarOpen: true,
  section: "trips",

  selectVehicle: (id, opts) =>
    set({ selectedVehicleId: id, followSelected: id ? (opts?.follow ?? false) : false }),
  setFollow: (follow) => set({ followSelected: follow }),
  setHovered: (id) => set((s) => (s.hoveredVehicleId === id ? s : { hoveredVehicleId: id })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSection: (section) =>
    set((s) => ({ section, sidebarOpen: true, unreadAlerts: section === "alerts" ? 0 : s.unreadAlerts })),
  markAlertsRead: () => set({ unreadAlerts: 0 }),
}));

/** Una fila por camión con todo lo necesario para listas, tablero y KPIs. */
export interface FleetRow {
  vehicle: Vehicle;
  /** Viaje en curso, próximo o último; null si el camión no tiene viajes. */
  trip: Trip | null;
  progress: TripProgress | null;
  state: DisplayState;
}

/** Filas de la flota ordenadas por urgencia (lo más atrasado primero). No incluye telemetría: cambia demasiado seguido. */
export function useFleetRows(): FleetRow[] {
  const vehicles = useFleetStore((s) => s.vehicles);
  const trips = useFleetStore((s) => s.trips);
  const progress = useFleetStore((s) => s.progress);
  const active = useFleetStore((s) => s.activeTripByVehicle);
  return useMemo(() => {
    const rows = Object.values(vehicles).map((vehicle): FleetRow => {
      const tripId = active[vehicle.id] ?? null;
      const trip = tripId ? (trips[tripId] ?? null) : null;
      const p = tripId ? (progress[tripId] ?? null) : null;
      return { vehicle, trip, progress: p, state: displayState(p) };
    });
    return rows.sort((a, b) => compareByRisk(a.progress, b.progress) || a.vehicle.unit.localeCompare(b.vehicle.unit));
  }, [vehicles, trips, progress, active]);
}

/** Todo lo de un camión para el panel de detalle. */
export function useVehicleDetail(vehicleId: string | null): (FleetRow & { telemetry: Telemetry | null }) | null {
  const vehicle = useFleetStore((s) => (vehicleId ? s.vehicles[vehicleId] : undefined));
  const tripId = useFleetStore((s) => (vehicleId ? (s.activeTripByVehicle[vehicleId] ?? null) : null));
  const trip = useFleetStore((s) => (tripId ? s.trips[tripId] : undefined));
  const progress = useFleetStore((s) => (tripId ? s.progress[tripId] : undefined));
  const telemetry = useFleetStore((s) => (vehicleId ? s.telemetry[vehicleId] : undefined));
  return useMemo(() => {
    if (!vehicle) return null;
    const p = progress ?? null;
    return { vehicle, trip: trip ?? null, progress: p, state: displayState(p), telemetry: telemetry ?? null };
  }, [vehicle, trip, progress, telemetry]);
}

/** Conteo de camiones por estado visual, para los indicadores. */
export function countByState(rows: FleetRow[]): Record<DisplayState, number> {
  const out: Record<DisplayState, number> = {
    on_time: 0,
    at_risk: 0,
    delayed: 0,
    stopped: 0,
    offline: 0,
    scheduled: 0,
    completed: 0,
    idle: 0,
  };
  for (const r of rows) out[r.state]++;
  return out;
}
