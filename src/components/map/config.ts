import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import type { DisplayState, LngLat } from "@/lib/types";
import { LAYOUT } from "@/lib/store";

/** Identificadores de fuentes y capas del mapa. */
export const SRC = {
  network: "traza-network",
  trucks: "traza-trucks",
  selRoute: "traza-sel-route",
  selEnds: "traza-sel-ends",
  selRing: "traza-sel-ring",
  incidents: "traza-incidents",
  dem: "traza-dem",
} as const;

export const LYR = {
  net: "traza-net",
  incidentZone: "traza-incident-zone",
  incidentZoneLine: "traza-incident-zone-line",
  selCasing: "traza-sel-casing",
  selDone: "traza-sel-done",
  selTodo: "traza-sel-todo",
  selEndsHalo: "traza-sel-ends-halo",
  selEnds: "traza-sel-ends",
  selEndsText: "traza-sel-ends-text",
  truckGlow: "traza-truck-glow",
  truckRing: "traza-truck-ring",
  truckRingTop: "traza-truck-ring-top",
  truckSel: "traza-truck-sel",
  selRingFill: "traza-sel-ring-fill",
  selRingLine: "traza-sel-ring-line",
  truckHead: "traza-truck-head",
  truckIcon: "traza-truck-icon",
  truckBody: "traza-truck-body",
  truckModel: "traza-truck-model",
  truckHit: "traza-truck-hit",
  truckLabel: "traza-truck-label",
  truckLabelSel: "traza-truck-label-sel",
} as const;

/** Capas del estilo Standard en las que se insertan las capas propias. */
export const SLOT = { middle: "middle", top: "top" } as const;

/** Fuentes de glifos disponibles en el estilo Standard (de día cargan bien). */
export const FONT_MEDIUM = ["DIN Pro Medium", "Arial Unicode MS Regular"];
export const FONT_BOLD = ["DIN Pro Bold", "Arial Unicode MS Bold"];

/**
 * Tema del mapa base de Standard: "faded" (suave, poca saturación), "monochrome" o "default".
 * Cambiar aquí si se quiere un mapa aún más neutro.
 */
export const BASEMAP_THEME: "default" | "faded" | "monochrome" = "monochrome";
export const BASEMAP_PRESET = "day";

/** Tiempos de la carga del mapa (ms). */
export const STYLE_TIMEOUT_MS = 12000;
export const REVEAL_TIMEOUT_MS = 3000;

/** Colores de texto sobre mapa claro. */
export const INK = "#1f2937";
export const HALO = "#ffffff";

/** Estados que se consideran "en operación" (más grandes y marcados). */
export const OPERATING_STATES: ReadonlySet<DisplayState> = new Set(["on_time", "at_risk", "delayed", "stopped"]);

export const ALL_STATES: DisplayState[] = [
  "on_time",
  "at_risk",
  "delayed",
  "stopped",
  "offline",
  "scheduled",
  "completed",
  "idle",
];


/** Colores de incidentes por severidad: crítico en rojo, advertencia en ámbar. */
export const INCIDENT_COLOR = {
  congestion: "#e5484d",
  breakdown: "#e5484d",
  border_closure: "#e5484d",
  port_delay: "#f5a524",
} as const;

export const PITCH_3D = 45;

/** Espacio que tapa la barra de tiempo, abajo. */
export const BOTTOM_PAD = 88;

/** Bajo este ancho de VENTANA (el `md` de Tailwind) el detalle es una hoja inferior en vez de un panel lateral. */
export const NARROW_PX = 768;
/** Parte del alto que se reserva arriba en la cámara de persecución. */
const CHASE_TOP_FRACTION = 0.3;
/** Parte del alto que cubre la hoja inferior del detalle en pantallas angostas. */
const SHEET_FRACTION = 0.62;

/** Padding de cámara: el área visible es lo que no tapan el panel de detalle (o la hoja) y la barra de tiempo. */
export function cameraPadding(hasSelection: boolean, width: number, height: number, chasing = false) {
  const narrow = width < NARROW_PX;
  return {
    left: 0,
    right: hasSelection && !narrow ? LAYOUT.detailW + 2 * LAYOUT.gap : 0,
    // En persecución el camión queda bajo el centro para ver más camino por delante
    top: chasing ? Math.round(height * CHASE_TOP_FRACTION) : 0,
    bottom: hasSelection && narrow ? Math.round(height * SHEET_FRACTION) : BOTTOM_PAD,
  };
}

/** Atajo para obtener una fuente GeoJSON y reemplazar sus datos. */
export function setGeoJson(map: MapboxMap, id: string, data: FC): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData(data as never);
}

export const EMPTY_FC: FC = { type: "FeatureCollection", features: [] };

/** GeoJSON mínimo (el proyecto no trae @types/geojson). */
export interface PointG {
  type: "Point";
  coordinates: LngLat;
}
export interface LineG {
  type: "LineString";
  coordinates: LngLat[];
}
export interface PolyG {
  type: "Polygon";
  coordinates: LngLat[][];
}
export interface Feat<G extends PointG | LineG | PolyG = PointG | LineG | PolyG> {
  type: "Feature";
  properties: Record<string, string | number | boolean | number[]>;
  geometry: G;
}
export interface FC {
  type: "FeatureCollection";
  features: Feat[];
}

// ───────────────────────── Camión realista (zoom cercano) ─────────────────────────

/** Largo de referencia del tractocamión (m), para dimensionar anillos y etiquetas; el modelo 3D mide ~16,7 m. */
export const TRUCK_LENGTH_M = 19.6;

/** Fundido cruzado entre la insignia (zoom lejano) y el cuerpo realista (zoom cercano). */
export const BODY_FADE_START = 15.4;
export const BODY_FADE_END = 16.2;

/** Exageración cartográfica del tamaño del camión por zoom (más grande que la realidad, como en Uber). */
export const BODY_EXAGGERATION: ReadonlyArray<readonly [zoom: number, k: number]> = [
  [13, 3.0],
  [14, 3.0],
  [15, 3.4],
  [16, 3.0],
  [17, 2.3],
  [18, 1.7],
  [19, 1.4],
  [20, 1.2],
  [21, 1.2],
  [22, 1.2],
];
export const BODY_ZOOMS: readonly number[] = BODY_EXAGGERATION.map(([z]) => z);

/** Píxeles por metro en el zoom z, a la latitud de Santiago (-33,4): 2^z / 65350. */
export function pxPerMeter(z: number): number {
  return 2 ** z / 65350;
}

/** Exageración en un zoom cualquiera (interpolación lineal entre los topes). */
export function exaggeration(z: number): number {
  const t = BODY_EXAGGERATION;
  if (z <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (z <= t[i][0]) {
      const [z0, k0] = t[i - 1];
      const [z1, k1] = t[i];
      return k0 + ((k1 - k0) * (z - z0)) / (z1 - z0);
    }
  }
  return t[t.length - 1][1];
}

/** Largo del camión en pantalla (px) en el zoom z, con exageración. */
export function bodyLengthPx(z: number): number {
  return pxPerMeter(z) * TRUCK_LENGTH_M * exaggeration(z);
}

/** Aplana topes `[zoom, valor, zoom, valor…]` para una expresión `interpolate` por zoom. */
export function zoomStops<T>(zooms: readonly number[], value: (z: number) => T): (number | T)[] {
  return zooms.flatMap((z) => [z, value(z)]);
}

/** Desplazamiento vertical (em) de la etiqueta para que quede bajo el cuerpo sin taparlo. */
export function labelOffsetEm(z: number, textSize: number, minEm: number): number {
  // 0,85: el camión se acorta en pantalla por la inclinación del mapa
  return Math.max(minEm, (bodyLengthPx(z) * 0.5 * 0.85 + 9) / textSize);
}

// ───────────────────────── Modelo 3D del camión ─────────────────────────

/** Entre estos zooms la insignia deja paso al modelo 3D (fundido cruzado). */
export const MODEL_FADE_START = BODY_FADE_START;
export const MODEL_FADE_END = BODY_FADE_END;
/**
 * Corrección del rumbo, en grados: con rotación 0 el frente del modelo puede no apuntar al norte.
 * Se ajusta mirando el mapa (el modelo se genera con el frente hacia +Z).
 */
export const MODEL_HEADING_OFFSET = 180;
/** Id del modelo en Mapbox y archivo glb de cada estado (scripts/generate-truck-model.mjs). */
export const modelId = (state: string) => `truck-model-${state}`;
export const modelUrl = (state: string) => `/models/truck-${state}.glb`;
