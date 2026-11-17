import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { Incident } from "@/lib/types";
import { INCIDENT_COLOR, INK, SRC, setGeoJson, type Feat } from "./config";

const STYLE_ID = "traza-map-styles";

/** Estilos de los marcadores DOM (el mapa los crea fuera de React). */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
@keyframes traza-inc-pulse {
  0% { transform: scale(0.8); opacity: 0.7; }
  100% { transform: scale(2.8); opacity: 0; }
}
.traza-inc {
  display: flex; align-items: center; gap: 7px; white-space: nowrap; pointer-events: none;
  padding: 5px 11px 5px 9px; border-radius: 9999px;
  background: #ffffff; border: 1.5px solid var(--c); color: ${INK};
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.06), 0 6px 14px -4px rgb(16 24 40 / 0.18);
  font: 600 11.5px/1 var(--font-sans, system-ui), sans-serif;
}
.traza-inc .pulse { position: relative; flex: none; width: 8px; height: 8px; }
.traza-inc .pulse i { position: absolute; inset: 0; border-radius: 9999px; background: var(--c); }
.traza-inc .pulse i.wave { animation: traza-inc-pulse 2s cubic-bezier(0.16, 1, 0.3, 1) infinite; }
@media (prefers-reduced-motion: reduce) { .traza-inc .pulse i.wave { animation: none; opacity: 0.25; } }
`;
  document.head.appendChild(el);
}

function buildElement(inc: Incident): HTMLElement {
  const root = document.createElement("div");
  root.className = "traza-inc";
  root.style.setProperty("--c", INCIDENT_COLOR[inc.kind]);
  root.innerHTML = `<span class="pulse"><i class="wave"></i><i></i></span><span class="tag"></span>`;
  (root.querySelector(".tag") as HTMLElement).textContent = inc.label;
  return root;
}

/** Marcadores de incidentes (píldora blanca con borde de severidad) y círculo de zona para las congestiones. */
export class IncidentLayer {
  private markers = new Map<string, { marker: Marker; label: string }>();
  private last: Incident[] | null = null;

  constructor(private map: MapboxMap) {
    injectStyles();
  }

  sync(incidents: Incident[]): void {
    if (incidents === this.last) return;
    this.last = incidents;

    const seen = new Set<string>();
    for (const inc of incidents) {
      seen.add(inc.id);
      const cur = this.markers.get(inc.id);
      if (cur) {
        cur.marker.setLngLat(inc.coord);
        if (cur.label !== inc.label) {
          (cur.marker.getElement().querySelector(".tag") as HTMLElement).textContent = inc.label;
          cur.label = inc.label;
        }
        continue;
      }
      const marker = new mapboxgl.Marker({
        element: buildElement(inc),
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat(inc.coord)
        .addTo(this.map);
      this.markers.set(inc.id, { marker, label: inc.label });
    }
    for (const [id, { marker }] of this.markers) {
      if (!seen.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }

    // Zona de congestión: radio en píxeles a zoom 0, que la capa multiplica por 2^zoom.
    const features: Feat[] = incidents
      .filter((i) => i.kind === "congestion" && i.radiusKm)
      .map((i) => ({
        type: "Feature",
        properties: { id: i.id, px0: ((i.radiusKm ?? 0) * 1000) / (78271.517 * Math.cos((i.coord[1] * Math.PI) / 180)) },
        geometry: { type: "Point", coordinates: i.coord },
      }));
    setGeoJson(this.map, SRC.incidents, { type: "FeatureCollection", features });
  }

  destroy(): void {
    for (const { marker } of this.markers.values()) marker.remove();
    this.markers.clear();
  }
}
