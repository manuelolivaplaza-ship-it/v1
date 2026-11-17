import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import { ROUTES } from "@/data";
import {
  ALL_STATES,
  BODY_FADE_END,
  BODY_FADE_START,
  BODY_ZOOMS,
  EMPTY_FC,
  MODEL_FADE_END,
  MODEL_FADE_START,
  type FC,
  FONT_BOLD,
  FONT_MEDIUM,
  HALO,
  INCIDENT_COLOR,
  INK,
  LYR,
  SLOT,
  SRC,
  bodyLengthPx,
  exaggeration,
  labelOffsetEm,
  modelId,
  modelUrl,
  zoomStops,
} from "./config";

/** Gris azulado de la red de corredores y gris claro del tramo ya recorrido. */
const NET_COLOR = "#94a3b8";
const DONE_COLOR = "#cbd5e1";

/**
 * Emisión: de día no se necesita que las capas "brillen"; líneas y círculos reciben algo de luz
 * del estilo y los símbolos (texto e íconos) van planos para conservar su color exacto.
 */
const EMIT_SHAPE = 0.6;
const EMIT_SYMBOL = 1;

/** Crea fuentes y capas, en el orden de apilado correcto. */
export function addLayers(map: MapboxMap): void {
  addNetwork(map);
  addIncidentZone(map);
  addSelectedRoute(map);
  addSelectedEnds(map);
  addSelectedRing(map);
  registerModels(map);
  addTrucks(map);
}

/** Carga los modelos 3D del camión (uno por estado, con la franja de ese color). */
function registerModels(map: MapboxMap): void {
  for (const state of ALL_STATES) {
    const id = modelId(state);
    if (!map.hasModel(id)) map.addModel(id, new URL(modelUrl(state), window.location.origin).href);
  }
}

// ───────────────────────── Red de corredores ─────────────────────────

function addNetwork(map: MapboxMap): void {
  const data: FC = {
    type: "FeatureCollection",
    features: ROUTES.map((r) => ({
      type: "Feature",
      properties: { id: r.id, corridor: r.corridor },
      geometry: { type: "LineString", coordinates: r.coordinates },
    })),
  };
  map.addSource(SRC.network, { type: "geojson", data, tolerance: 0.8 });

  map.addLayer({
    id: LYR.net,
    type: "line",
    source: SRC.network,
    slot: SLOT.middle,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": NET_COLOR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.6, 12, 2.4],
      "line-opacity": 0.55,
      "line-emissive-strength": EMIT_SHAPE,
    },
  });
}

// ───────────────────────── Zona de congestión ─────────────────────────

function addIncidentZone(map: MapboxMap): void {
  map.addSource(SRC.incidents, { type: "geojson", data: EMPTY_FC });
  // Radio en metros convertido a píxeles: px(z) = px0 · 2^z, con px0 precalculado por incidente.
  const radius = ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "px0"], 22, ["*", ["get", "px0"], 4194304]] as const;
  map.addLayer({
    id: LYR.incidentZone,
    type: "circle",
    source: SRC.incidents,
    slot: SLOT.middle,
    paint: {
      "circle-radius": radius as unknown as ExpressionSpecification,
      "circle-color": INCIDENT_COLOR.congestion,
      "circle-opacity": 0.12,
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  map.addLayer({
    id: LYR.incidentZoneLine,
    type: "circle",
    source: SRC.incidents,
    slot: SLOT.middle,
    paint: {
      "circle-radius": radius as unknown as ExpressionSpecification,
      "circle-color": INCIDENT_COLOR.congestion,
      "circle-opacity": 0,
      "circle-stroke-color": INCIDENT_COLOR.congestion,
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.5,
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
}

// ───────────────────────── Ruta del camión seleccionado ─────────────────────────

function addSelectedRoute(map: MapboxMap): void {
  map.addSource(SRC.selRoute, { type: "geojson", data: EMPTY_FC });
  const layout = { "line-cap": "round", "line-join": "round" } as const;

  // Borde blanco bajo toda la ruta para que lea sobre el mapa
  map.addLayer({
    id: LYR.selCasing,
    type: "line",
    source: SRC.selRoute,
    slot: SLOT.middle,
    layout,
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 5, 14, 11],
      "line-opacity": 0.95,
      "line-emissive-strength": EMIT_SHAPE,
    },
  });
  // Tramo recorrido: gris claro
  map.addLayer({
    id: LYR.selDone,
    type: "line",
    source: SRC.selRoute,
    slot: SLOT.middle,
    filter: ["==", ["get", "part"], "done"],
    layout,
    paint: {
      "line-color": DONE_COLOR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.4, 14, 5],
      "line-emissive-strength": EMIT_SHAPE,
    },
  });
  // Tramo pendiente: color del estado
  map.addLayer({
    id: LYR.selTodo,
    type: "line",
    source: SRC.selRoute,
    slot: SLOT.middle,
    filter: ["==", ["get", "part"], "todo"],
    layout,
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.6, 14, 6],
      "line-emissive-strength": EMIT_SHAPE,
    },
  });
}

function addSelectedEnds(map: MapboxMap): void {
  map.addSource(SRC.selEnds, { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: LYR.selEndsHalo,
    type: "circle",
    source: SRC.selEnds,
    slot: SLOT.top,
    paint: {
      "circle-radius": 13,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.16,
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  map.addLayer({
    id: LYR.selEnds,
    type: "circle",
    source: SRC.selEnds,
    slot: SLOT.top,
    paint: {
      "circle-radius": 6,
      // Origen: aro hueco blanco. Destino: punto lleno con borde blanco.
      "circle-color": ["case", ["==", ["get", "role"], "origin"], "#ffffff", ["get", "color"]],
      "circle-stroke-color": ["case", ["==", ["get", "role"], "origin"], ["get", "color"], "#ffffff"],
      "circle-stroke-width": 2.5,
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  map.addLayer({
    id: LYR.selEndsText,
    type: "symbol",
    source: SRC.selEnds,
    slot: SLOT.top,
    layout: {
      "text-field": ["get", "tag"],
      "text-font": FONT_BOLD,
      "text-size": 11,
      "text-offset": [0, -1.4],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": INK,
      "text-halo-color": HALO,
      "text-halo-width": 1.6,
      "text-emissive-strength": EMIT_SYMBOL,
    },
  });
}

// ───────────────────────── Camiones ─────────────────────────

/** Zooms en los que se calculan los topes de tamaño (cuerpo, radios y desfase de etiquetas). */
const Z = BODY_ZOOMS;

/** Opacidad por zoom: la insignia y la cuña se apagan mientras el cuerpo realista aparece. */
const fadeOut = (v: unknown) => ["interpolate", ["linear"], ["zoom"], BODY_FADE_START, v, BODY_FADE_END, 0] as unknown as ExpressionSpecification;
const fadeIn = (v: unknown) => ["interpolate", ["linear"], ["zoom"], BODY_FADE_START, 0, BODY_FADE_END, v] as unknown as ExpressionSpecification;

/** Expresión `interpolate` exponencial por zoom con un valor por tope. */
const byZoom = (zooms: readonly number[], value: (z: number) => unknown) =>
  ["interpolate", ["exponential", 2], ["zoom"], ...zoomStops(zooms, value)] as unknown as ExpressionSpecification;

function addTrucks(map: MapboxMap): void {
  map.addSource(SRC.trucks, { type: "geojson", data: EMPTY_FC });
  const pulse = ["get", "pulse"];
  const ringOpacity = ["*", 0.85, ["-", 1, pulse]];

  // Halo casi invisible: solo zona de clic ampliada del camión de pie; se apaga con el cuerpo realista.
  map.addLayer({
    id: LYR.truckGlow,
    type: "circle",
    source: SRC.trucks,
    slot: SLOT.top,
    maxzoom: BODY_FADE_END,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, ["*", ["get", "glowR"], 0.85], 13, ["*", ["get", "glowR"], 1.25]],
      "circle-color": ["get", "color"],
      "circle-opacity": fadeOut(["get", "glowA"]),
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  // Anillo pulsante (retrasados y detenidos), en dos versiones: de pie (zoom lejano) y tumbado sobre el suelo (cercano)
  map.addLayer({
    id: LYR.truckRing,
    type: "circle",
    source: SRC.trucks,
    slot: SLOT.top,
    maxzoom: BODY_FADE_END,
    filter: ["==", ["get", "ring"], 1],
    paint: {
      "circle-radius": ["interpolate", ["linear"], pulse, 0, 12, 1, 38],
      "circle-color": ["get", "color"],
      "circle-opacity": 0,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-stroke-opacity": fadeOut(ringOpacity),
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  map.addLayer({
    id: LYR.truckRingTop,
    type: "circle",
    source: SRC.trucks,
    slot: SLOT.top,
    minzoom: 13,
    filter: ["==", ["get", "ring"], 1],
    paint: {
      "circle-radius": byZoom(Z, (z) => ["*", 1.2 * bodyLengthPx(z), ["+", 0.3, ["*", 0.9, pulse]]]),
      "circle-color": ["get", "color"],
      "circle-opacity": 0,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
      "circle-stroke-opacity": fadeIn(ringOpacity),
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  // Aro de selección: oscuro, para que se vea sobre mapa claro
  map.addLayer({
    id: LYR.truckSel,
    type: "circle",
    source: SRC.trucks,
    slot: SLOT.top,
    maxzoom: BODY_FADE_END,
    filter: ["==", ["get", "sel"], 1],
    paint: {
      "circle-radius": 27,
      "circle-color": "#ffffff",
      "circle-opacity": fadeOut(0.45),
      "circle-stroke-color": INK,
      "circle-stroke-width": 1.8,
      "circle-stroke-opacity": fadeOut(0.8),
      "circle-emissive-strength": EMIT_SHAPE,
    },
  });
  // Cuña de rumbo: gira con el camión, alrededor de la insignia.
  map.addLayer({
    id: LYR.truckHead,
    type: "symbol",
    source: SRC.trucks,
    slot: SLOT.top,
    maxzoom: BODY_FADE_END,
    layout: {
      "icon-image": ["get", "headIcon"],
      "icon-size": ["get", "size"],
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-z-order": "source",
      "symbol-sort-key": ["get", "zKey"],
    },
    paint: {
      "icon-opacity": fadeOut(["get", "alpha"]),
      "icon-emissive-strength": EMIT_SYMBOL,
    },
  });
  // Insignia del camión: no rota, para que el pictograma siempre se lea derecho.
  map.addLayer({
    id: LYR.truckIcon,
    type: "symbol",
    source: SRC.trucks,
    slot: SLOT.top,
    maxzoom: BODY_FADE_END,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["get", "size"],
      "icon-rotation-alignment": "viewport",
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-z-order": "source",
      "symbol-sort-key": ["get", "zKey"],
    },
    paint: {
      "icon-opacity": fadeOut(["get", "alpha"]),
      "icon-emissive-strength": EMIT_SYMBOL,
    },
  });
  // Zona de clic del camión a zoom cercano: círculo totalmente transparente (no se dibuja, pero se puede consultar).
  map.addLayer({
    id: LYR.truckHit,
    type: "circle",
    source: SRC.trucks,
    slot: SLOT.top,
    minzoom: BODY_FADE_START,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        ...zoomStops(
          Z.filter((z) => z >= 14),
          (z) => Math.min(170, Math.max(14, bodyLengthPx(z) * 0.45)),
        ),
      ] as unknown as ExpressionSpecification,
      // Totalmente transparente: con 0,01 se notaba un disco gris. Mapbox consulta círculos aunque no se vean.
      "circle-opacity": 0,
      "circle-pitch-alignment": "viewport",
    },
  });
  // Modelo 3D real: tractocamión con volumen, sombras y orientación por rumbo (se ve desde zoom ~15,5).
  const modelScale = [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...zoomStops([MODEL_FADE_START, ...Z.filter((z) => z > MODEL_FADE_START)], (z) => {
      const k = exaggeration(z);
      return ["literal", [k, k, k]];
    }),
  ] as unknown as ExpressionSpecification;
  map.addLayer({
    id: LYR.truckModel,
    type: "model",
    source: SRC.trucks,
    slot: SLOT.top,
    minzoom: MODEL_FADE_START,
    layout: {
      "model-id": ["concat", "truck-model-", ["get", "state"]] as unknown as ExpressionSpecification,
    },
    paint: {
      "model-rotation": ["get", "rot"] as unknown as ExpressionSpecification,
      "model-scale": modelScale,
      "model-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        MODEL_FADE_START,
        0,
        MODEL_FADE_END,
        ["get", "bodyA"],
      ] as unknown as ExpressionSpecification,
      "model-cast-shadows": true,
      "model-receive-shadows": true,
      "model-elevation-reference": "ground",
    },
  });
  // Unidad en texto oscuro; el desvío (si hay) en el tono de texto del estado.
  const label = ["format", ["get", "unit"], {}, ["get", "delay"], { "text-color": ["get", "ink"] }] as unknown as ExpressionSpecification;
  // Desfase vertical por zoom: bajo la insignia de lejos y bajo el cuerpo de cerca.
  const labelOffset = (size: number, minEm: number) =>
    [
      "interpolate",
      ["linear"],
      ["zoom"],
      BODY_FADE_START,
      ["literal", [0, minEm]],
      BODY_FADE_END,
      ["literal", [0, labelOffsetEm(BODY_FADE_END, size, minEm)]],
      ...zoomStops(
        Z.filter((z) => z > BODY_FADE_END),
        (z) => ["literal", [0, labelOffsetEm(z, size, minEm)]],
      ),
    ] as unknown as ExpressionSpecification;
  map.addLayer({
    id: LYR.truckLabel,
    type: "symbol",
    source: SRC.trucks,
    slot: SLOT.top,
    filter: ["!=", ["get", "sel"], 1],
    layout: {
      "text-field": label,
      "text-font": FONT_MEDIUM,
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": labelOffset(11, 1.5),
      "text-optional": true,
      // Menor valor = se coloca primero: retrasados y en riesgo ganan a los de a tiempo
      "symbol-sort-key": ["get", "prio"],
    },
    paint: {
      "text-color": INK,
      "text-opacity": ["get", "labelA"],
      "text-halo-color": HALO,
      "text-halo-width": 1.6,
      "text-emissive-strength": EMIT_SYMBOL,
    },
  });
  // El seleccionado siempre muestra su etiqueta, aunque choque con otras.
  map.addLayer({
    id: LYR.truckLabelSel,
    type: "symbol",
    source: SRC.trucks,
    slot: SLOT.top,
    filter: ["==", ["get", "sel"], 1],
    layout: {
      "text-field": label,
      "text-font": FONT_BOLD,
      "text-size": 12.5,
      "text-anchor": "top",
      "text-offset": labelOffset(12.5, 2.1),
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": INK,
      "text-halo-color": HALO,
      "text-halo-width": 2,
      "text-emissive-strength": EMIT_SYMBOL,
    },
  });
}

// ───────────────────────── Aro de selección a zoom cercano ─────────────────────────

/** Polígono en coordenadas del mapa: queda tumbado sobre el suelo y sigue el relieve (ver selectedRing.ts). */
function addSelectedRing(map: MapboxMap): void {
  map.addSource(SRC.selRing, { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: LYR.selRingFill,
    type: "fill",
    source: SRC.selRing,
    slot: SLOT.top,
    minzoom: 13,
    paint: {
      "fill-color": "#ffffff",
      "fill-opacity": fadeIn(0.25),
      "fill-emissive-strength": EMIT_SHAPE,
    },
  });
  map.addLayer({
    id: LYR.selRingLine,
    type: "line",
    source: SRC.selRing,
    slot: SLOT.top,
    minzoom: 13,
    layout: { "line-join": "round" },
    paint: {
      "line-color": INK,
      "line-width": 2,
      "line-opacity": fadeIn(0.8),
      "line-emissive-strength": EMIT_SHAPE,
    },
  });
}
