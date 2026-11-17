import type { Map as MapboxMap } from "mapbox-gl";
import { formatDelay, displayState, STATE_COLOR } from "@/lib/labels";
import { haversineKm, lerpAngle, lerpCoord } from "@/lib/geo";
import type { FleetState } from "@/lib/store";
import type { DisplayState, LngLat, Telemetry } from "@/lib/types";
import { MODEL_HEADING_OFFSET, OPERATING_STATES, SRC, setGeoJson, type Feat, type PointG } from "./config";

/** Interpolación continua entre muestras: parte siempre de lo que se está mostrando, así nunca hay saltos. */
interface Motion {
  fromCoord: LngLat;
  toCoord: LngLat;
  toHeading: number;
  start: number;
  interval: number;
  lastArrival: number;
  /** Última muestra recibida (para detectar cuándo cambia). */
  source: Telemetry;
  coord: LngLat;
  heading: number;
}

/** Atributos visuales que dependen del estado del viaje (se recalculan ~4 veces por segundo). */
interface Look {
  unit: string;
  state: DisplayState;
  color: string;
  /** Tono de texto legible sobre blanco para el desvío de la etiqueta. */
  ink: string;
  delay: string;
  ring: boolean;
  size: number;
  alpha: number;
  glowR: number;
  glowA: number;
  labelA: number;
  /** Opacidad del cuerpo realista (zoom cercano): los estacionados también se ven. */
  bodyA: number;
  /** Menor = más prioridad de etiqueta. */
  prio: number;
}

const PRIO: Record<DisplayState, number> = {
  delayed: 1,
  stopped: 2,
  at_risk: 3,
  on_time: 4,
  offline: 5,
  scheduled: 6,
  completed: 7,
  idle: 8,
};

/** Tonos de texto de los estados con desvío (coinciden con `--late-ink` y `--warn-ink`). */
const DELAY_INK: Partial<Record<DisplayState, string>> = { delayed: "#c0282e", at_risk: "#9a5b00" };

/** Constante de tiempo (s) del filtro del rumbo mostrado. */
const HEADING_TAU = 0.2;
/** La posición tarda un poco más que el intervalo entre muestras para no detenerse si una llega tarde. */
const INTERVAL_STRETCH = 1.15;

const MIN_INTERVAL = 50;
const MAX_INTERVAL = 400;
/** Saltos mayores a esto (reinicio del día simulado) se muestran de golpe. */
const SNAP_KM = 25;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function buildLook(unit: string, state: DisplayState, delayMin: number | null): Look {
  const operating = OPERATING_STATES.has(state);
  let delay = "";
  if ((state === "at_risk" || state === "delayed") && delayMin !== null) {
    const txt = formatDelay(delayMin);
    if (txt !== "a tiempo") delay = `  ${txt}`;
  }
  const discreet = state === "scheduled" || state === "completed" || state === "idle";
  return {
    unit,
    state,
    color: STATE_COLOR[state],
    ink: DELAY_INK[state] ?? "#1f2937",
    delay,
    ring: state === "delayed" || state === "stopped",
    size: operating ? 1 : state === "offline" ? 0.85 : 0.7,
    alpha: operating ? 1 : discreet ? 0.55 : 0.75,
    glowR: operating ? 17 : 13,
    glowA: operating ? 0.06 : 0.03,
    labelA: operating ? 1 : discreet ? 0.55 : 0.75,
    bodyA: operating ? 1 : discreet ? 0.8 : 0.9,
    prio: PRIO[state],
  };
}

/** Posición, rumbo y atributos de todos los camiones; empuja una FeatureCollection por cuadro. */
export class TruckLayer {
  private motion = new Map<string, Motion>();
  private looks = new Map<string, Look>();
  private features: Feat<PointG>[] = [];
  private index = new Map<string, Feat<PointG>>();
  private lastTelemetry: FleetState["telemetry"] | null = null;
  private lastLookKey: unknown[] = [];
  private lastFrame = 0;

  constructor(private map: MapboxMap) {}

  /** Posición mostrada ahora mismo (la que ve el usuario), para que la cámara la siga. */
  getPosition(id: string): LngLat | null {
    return this.motion.get(id)?.coord ?? null;
  }

  getHeading(id: string): number {
    return this.motion.get(id)?.heading ?? 0;
  }

  /** Incorpora lo que haya de nuevo en el store. Barato: compara referencias. */
  sync(s: FleetState, now: number): void {
    if (s.telemetry !== this.lastTelemetry) {
      this.lastTelemetry = s.telemetry;
      this.ingestTelemetry(s.telemetry, now);
    }
    const key = [s.vehicles, s.activeTripByVehicle, s.progress];
    if (key.some((k, i) => k !== this.lastLookKey[i])) {
      this.lastLookKey = key;
      this.rebuildLooks(s);
    }
  }

  private ingestTelemetry(all: Record<string, Telemetry>, now: number): void {
    for (const id in all) {
      const t = all[id];
      const m = this.motion.get(id);
      if (!m) {
        this.motion.set(id, {
          fromCoord: t.coord,
          toCoord: t.coord,
          toHeading: t.heading,
          start: now,
          interval: 100,
          lastArrival: now,
          source: t,
          coord: t.coord,
          heading: t.heading,
        });
        continue;
      }
      if (m.source === t || m.source.ts === t.ts) continue;
      const gap = now - m.lastArrival;
      // Promedio móvil del intervalo entre muestras
      m.interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, m.interval * 0.7 + gap * 0.3));
      m.lastArrival = now;
      m.source = t;
      if (haversineKm(m.coord, t.coord) > SNAP_KM) {
        m.fromCoord = t.coord;
        m.heading = t.heading;
      } else {
        m.fromCoord = m.coord;
      }
      m.toCoord = t.coord;
      m.toHeading = t.heading;
      m.start = now;
    }
  }

  private rebuildLooks(s: FleetState): void {
    this.looks.clear();
    for (const id in s.vehicles) {
      const tripId = s.activeTripByVehicle[id] ?? null;
      const p = tripId ? s.progress[tripId] : undefined;
      this.looks.set(id, buildLook(s.vehicles[id].unit, displayState(p), p ? p.delayMin : null));
    }
  }

  /** Avanza la animación y actualiza la fuente del mapa. */
  frame(now: number, selectedId: string | null, hoveredId: string | null): void {
    const feats = this.features;
    let n = 0;
    // Tiempo real entre cuadros (no por cuadro): el suavizado es igual a 30 o a 144 Hz.
    const dt = this.lastFrame ? Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000)) : 0.016;
    this.lastFrame = now;
    const headK = 1 - Math.exp(-dt / HEADING_TAU);
    for (const [id, m] of this.motion) {
      const t = Math.min(1, Math.max(0, (now - m.start) / (m.interval * INTERVAL_STRETCH)));
      m.coord = t >= 1 ? m.toCoord : lerpCoord(m.fromCoord, m.toCoord, t);
      // El rumbo del simulador salta en cada vértice de la ruta: se suaviza con un filtro pasa-bajos.
      m.heading = lerpAngle(m.heading, m.toHeading, headK);

      const look = this.looks.get(id);
      if (!look) continue;

      const sel = id === selectedId;
      const hov = !sel && id === hoveredId;
      const boost = sel ? 1.35 : hov ? 1.15 : 1;
      const phase = (now / 1700 + hash01(id)) % 1;

      let f = this.index.get(id);
      if (!f) {
        f = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: m.coord } };
        this.index.set(id, f);
      }
      f.geometry.coordinates = m.coord;
      f.properties = {
        id,
        unit: look.unit,
        delay: look.delay,
        color: look.color,
        ink: look.ink,
        state: look.state,
        bodyA: look.bodyA,
        icon: `truck-${look.state}`,
        headIcon: `truck-head-${look.state}`,
        heading: m.heading,
        // Giro del modelo 3D: [cabeceo, alabeo, rumbo] en grados
        rot: [0, 0, m.heading + MODEL_HEADING_OFFSET],
        size: look.size * boost,
        alpha: sel || hov ? 1 : look.alpha,
        glowR: look.glowR * (sel ? 1.5 : hov ? 1.3 : 1),
        glowA: sel ? 0.08 : hov ? 0.08 : look.glowA,
        labelA: sel || hov ? 1 : look.labelA,
        ring: look.ring ? 1 : 0,
        pulse: phase,
        sel: sel ? 1 : 0,
        // Dibujo: el seleccionado encima de todo, luego el resaltado, luego por urgencia
        zKey: sel ? 100 : hov ? 50 : 20 - look.prio,
        // Etiquetas: menor valor gana los choques
        prio: sel || hov ? 0 : look.prio,
      };
      feats[n++] = f;
    }
    feats.length = n;
    setGeoJson(this.map, SRC.trucks, { type: "FeatureCollection", features: feats });
  }
}
