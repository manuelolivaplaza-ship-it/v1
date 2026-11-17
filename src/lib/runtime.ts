"use client";

import { createSimulator } from "@/sim";
import { createTracker } from "@/tracking";
import { DEFAULT_TIME_SCALE, useFleetStore } from "./store";
import type { Alert, SimControls, Telemetry, TrackerOutput } from "./types";

/**
 * Cada cuánto (ms reales) se publica el estado de los viajes al store. Con la simulación a ×30
 * un segundo real son 30 simulados, así que más seguido no aporta nada a las listas y paneles
 * (el mapa mueve los camiones por su cuenta con la telemetría).
 */
const PROGRESS_INTERVAL_MS = 1000;
const MAX_ALERTS = 120;

function shallowEqual<T>(a: Record<string, T>, b: Record<string, T>): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Conecta la fuente de telemetría (hoy el simulador) con el motor de seguimiento
 * y publica el resultado en el store. Para usar GPS reales bastaría cambiar la fuente.
 * Devuelve la función que lo apaga.
 */
export function bootRuntime(): () => void {
  let disposed = false;
  let cleanup: (() => void) | null = null;

  const boot = () => {
    if (disposed) return;
    const prev = useFleetStore.getState();
    const timeScale = prev.ready ? prev.sim.timeScale : DEFAULT_TIME_SCALE;
    const sim = createSimulator({ timeScale });
    const { vehicles, trips, dayStart } = sim.scenario;
    const tracker = createTracker({ vehicles, trips });

    let warming = true;
    let last: TrackerOutput | null = null;
    const telemetry: Record<string, Telemetry> = {};
    const history: Alert[] = [];
    let lastProgressPush = 0;

    const unsubscribe = sim.subscribe((batch) => {
      const out = tracker.ingest(batch);
      last = out;
      for (const t of batch.items) telemetry[t.vehicleId] = t;

      if (warming) {
        // Durante el precalentamiento solo se acumula historia; el store se llena una vez al final.
        if (out.alerts.length) history.unshift(...[...out.alerts].reverse());
        return;
      }

      const wall = performance.now();
      const pushProgress = out.alerts.length > 0 || wall - lastProgressPush >= PROGRESS_INTERVAL_MS;
      if (pushProgress) lastProgressPush = wall;

      useFleetStore.setState((s) => {
        const next: Partial<typeof s> = { now: batch.now, telemetry: { ...telemetry } };
        if (pushProgress) {
          if (!shallowEqual(s.progress, out.progress)) next.progress = { ...out.progress };
          if (!shallowEqual(s.activeTripByVehicle, out.activeTripByVehicle)) {
            next.activeTripByVehicle = { ...out.activeTripByVehicle };
          }
        }
        if (out.alerts.length) {
          next.alerts = [...[...out.alerts].reverse(), ...s.alerts].slice(0, MAX_ALERTS);
          next.unreadAlerts = s.section === "alerts" && s.sidebarOpen ? 0 : s.unreadAlerts + out.alerts.length;
        }
        return next;
      });
    });

    const unsubscribeIncidents = sim.subscribeIncidents((incidents) => {
      useFleetStore.setState({ incidents: [...incidents] });
    });

    sim.warmUp();
    warming = false;

    const controls: SimControls = {
      setRunning(running) {
        if (running) sim.start();
        else sim.stop();
        useFleetStore.setState((s) => ({ sim: { ...s.sim, running } }));
      },
      setTimeScale(scale) {
        sim.setTimeScale(scale);
        useFleetStore.setState((s) => ({ sim: { ...s.sim, timeScale: scale } }));
      },
      injectIncident(req) {
        sim.injectIncident(req);
      },
      clearIncident(id) {
        sim.clearIncident(id);
      },
      reset() {
        cleanup?.();
        boot();
      },
    };

    const out = last as TrackerOutput | null;
    useFleetStore.setState({
      ready: true,
      now: sim.now(),
      dayStart,
      vehicles: Object.fromEntries(vehicles.map((v) => [v.id, v])),
      trips: Object.fromEntries(trips.map((t) => [t.id, t])),
      telemetry: { ...telemetry },
      progress: out ? { ...out.progress } : {},
      activeTripByVehicle: out ? { ...out.activeTripByVehicle } : {},
      alerts: history.slice(0, MAX_ALERTS),
      unreadAlerts: 0,
      incidents: [...sim.getIncidents()],
      sim: { running: true, timeScale },
      controls,
    });

    sim.start();

    cleanup = () => {
      unsubscribe();
      unsubscribeIncidents();
      sim.dispose();
    };
  };

  // Un respiro para que la pantalla de carga alcance a pintarse antes del precalentamiento.
  const timer = setTimeout(boot, 30);

  return () => {
    disposed = true;
    clearTimeout(timer);
    cleanup?.();
  };
}
