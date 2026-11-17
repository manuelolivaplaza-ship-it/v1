"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { HOME_VIEW } from "@/data";
import type { CameraController } from "./camera";
import { BASEMAP_PRESET, BASEMAP_THEME, PITCH_3D, REVEAL_TIMEOUT_MS, SRC, STYLE_TIMEOUT_MS } from "./config";
import { FleetMapController } from "./controller";
import MapControls from "./MapControls";
import { MapError, MapLoading, MissingToken, WebglUnsupported } from "./MapLoading";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface MapApi {
  map: MapboxMap;
  camera: CameraController;
}

/** Configuración del mapa base Standard: de día, sobrio y sin comercios ni transporte. */
const BASEMAP_CONFIG = {
  lightPreset: BASEMAP_PRESET,
  theme: BASEMAP_THEME,
  showPointOfInterestLabels: false,
  showTransitLabels: false,
};

/** Reaplica la configuración del mapa base (por si el estilo la ignoró al crearse) y deja niebla clara y relieve. */
function styleForDay(map: MapboxMap): void {
  for (const [key, value] of Object.entries(BASEMAP_CONFIG)) {
    try {
      map.setConfigProperty("basemap", key, value);
    } catch {
      // El mapa base puede no estar listo todavía o no tener esa propiedad: no es crítico
    }
  }

  try {
    map.setFog({
      color: "rgb(236, 240, 245)",
      "high-color": "rgb(226, 233, 243)",
      "horizon-blend": 0.08,
      "space-color": "rgb(238, 242, 247)",
      "star-intensity": 0,
    });
  } catch {
    // Sin niebla propia se usa la del estilo
  }

  // Relieve para que la cordillera se vea al ir hacia Los Libertadores (si el estilo no trae uno).
  try {
    if (!map.getTerrain()) {
      map.addSource(SRC.dem, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: SRC.dem, exaggeration: 1.25 });
    }
  } catch {
    // Sin relieve el mapa funciona igual
  }
}

/** Mensaje específico según el error que impidió cargar el estilo. */
function describeError(err: unknown): string {
  const e = err as { status?: number; message?: string } | undefined;
  const status = e?.status;
  const msg = e?.message ?? "";
  if (status === 401 || status === 403 || /\b(401|403)\b|token|unauthorized|forbidden/i.test(msg)) {
    return "El token de Mapbox no es válido o no tiene permisos para este estilo.";
  }
  if (status === 404) return "No se encontró el estilo del mapa en Mapbox.";
  if (status === 429) return "Mapbox recibió demasiadas solicitudes. Espera un momento y reintenta.";
  if (!status || status === 0 || /failed to fetch|network|load failed/i.test(msg)) {
    return "No hay conexión con Mapbox. Revisa tu red o los bloqueadores de contenido e inténtalo de nuevo.";
  }
  return "Mapbox no pudo entregar el estilo del mapa. Inténtalo de nuevo en unos segundos.";
}

function MapView({ onRetry }: { onRetry: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported] = useState(() => mapboxgl.supported());
  const [api, setApi] = useState<MapApi | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!TOKEN || !container || !supported) return;

    // El doble montaje del modo estricto crea y destruye un mapa antes del definitivo.
    let disposed = false;
    let styleReady = false;
    let controller: FleetMapController | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeRaf = 0;

    const fail = (message: string) => {
      if (disposed || styleReady) return;
      clearTimeout(styleTimer);
      setError(message);
    };

    mapboxgl.accessToken = TOKEN;
    let map: MapboxMap;
    try {
      map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/standard",
        config: { basemap: BASEMAP_CONFIG },
        center: HOME_VIEW.center,
        zoom: HOME_VIEW.zoom,
        pitch: PITCH_3D,
        bearing: 0,
        maxPitch: 78,
        projection: "mercator",
        antialias: true,
        attributionControl: true,
        dragRotate: true,
      });
    } catch {
      // Típico cuando el contexto WebGL no se puede crear
      // En un microtask: React no quiere un setState síncrono dentro del efecto
      queueMicrotask(() => setError("No se pudo iniciar el mapa. Revisa que tu navegador tenga WebGL activo e inténtalo de nuevo."));
      return;
    }

    // Mapbox no detecta cambios del contenedor (p. ej. al plegar la barra lateral): se avisa a mano.
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (!disposed) map.resize();
      });
    });
    ro.observe(container);

    const styleTimer = setTimeout(
      () => fail("El estilo del mapa tardó demasiado en cargar. Revisa tu conexión e inténtalo de nuevo."),
      STYLE_TIMEOUT_MS,
    );

    map.on("style.load", () => {
      if (disposed || controller) return;
      styleReady = true;
      clearTimeout(styleTimer);
      setError(null); // por si el estilo llegó después de un aviso de lentitud
      styleForDay(map);
      try {
        controller = new FleetMapController(map);
      } catch {
        controller = null;
        styleReady = false;
        setError("No se pudieron dibujar las capas de la flota. Inténtalo de nuevo.");
        return;
      }
      setApi({ map, camera: controller.camera });

      // La pantalla de carga sale con el primer cuadro con mosaicos cargados, o a los pocos segundos.
      // No sirve esperar "idle": con los camiones animándose en cada cuadro el mapa nunca queda en reposo.
      const reveal = () => {
        map.off("render", onRender);
        clearTimeout(revealTimer);
        if (!disposed) setLoaded(true);
      };
      const onRender = () => {
        if (map.areTilesLoaded()) reveal();
      };
      map.on("render", onRender);
      revealTimer = setTimeout(reveal, REVEAL_TIMEOUT_MS);
    });

    // Los basemaps se cargan como "import": si llegan después de style.load, se reaplica el tema.
    map.on("style.import.load", () => {
      if (!disposed && styleReady) styleForDay(map);
    });

    // Solo importan los errores que impiden cargar el estilo; un mosaico suelto que falla no.
    map.on("error", (e) => {
      if (disposed || styleReady) return;
      const ev = e as unknown as { tile?: unknown; sourceId?: string };
      if (ev.tile || ev.sourceId) return;
      fail(describeError(e.error));
    });

    return () => {
      disposed = true;
      clearTimeout(styleTimer);
      clearTimeout(revealTimer);
      cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      controller?.destroy();
      controller = null;
      map.remove();
      setApi(null);
      setLoaded(false);
    };
  }, [supported]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-muted">
      {/* Mapbox fuerza `position: relative` en su contenedor, así que el tamaño va con alto y ancho explícitos. */}
      <div ref={containerRef} className="h-full w-full" />
      {api && !error && <MapControls map={api.map} camera={api.camera} />}
      {!supported ? <WebglUnsupported /> : error ? <MapError message={error} onRetry={onRetry} /> : <MapLoading visible={!loaded} />}
    </div>
  );
}

export default function FleetMap() {
  // Cada reintento monta un MapView nuevo: destruye el mapa anterior y crea otro desde cero.
  const [attempt, setAttempt] = useState(0);
  if (!TOKEN) return <MissingToken />;
  return <MapView key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}
