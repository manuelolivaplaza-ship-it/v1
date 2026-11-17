import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { PLACES } from "@/data";
import type { PlaceKind } from "@/lib/types";

/** Las ciudades solo se muestran desde este zoom; puertos, paso y centros siempre. */
const CITY_MIN_ZOOM = 7.5;

const SVG_OPEN =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Íconos de 12 px, trazo de 1,5 px (3 en el viewBox de 24), estilo lucide. */
const ICON: Record<PlaceKind, string> = {
  // Bodega
  depot: `${SVG_OPEN}<path d="M3 9.5 12 4l9 5.5V20H3Z"/><path d="M9 20v-6h6v6"/></svg>`,
  // Ancla
  port: `${SVG_OPEN}<circle cx="12" cy="5" r="3"/><path d="M12 8v14"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`,
  // Bandera
  border: `${SVG_OPEN}<path d="M4 22V4"/><path d="M4 4h14l-3 4.5 3 4.5H4"/></svg>`,
  // Punto
  city: `${SVG_OPEN}<circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`,
};

function buildElement(kind: PlaceKind, name: string): HTMLElement {
  const root = document.createElement("div");
  root.className =
    "pointer-events-none flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-foreground shadow-card";
  root.innerHTML = `<span class="text-muted-foreground flex">${ICON[kind]}</span><span class="label"></span>`;
  (root.querySelector(".label") as HTMLElement).textContent = name;
  return root;
}

/** Marcadores DOM de los lugares (centros, puertos, paso fronterizo y ciudades). */
export class PlaceLayer {
  private markers: { marker: Marker; el: HTMLElement; city: boolean }[] = [];
  private citiesShown = true;

  constructor(private map: MapboxMap) {
    for (const p of PLACES) {
      const el = buildElement(p.kind, p.shortName);
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat(p.coord)
        .addTo(map);
      this.markers.push({ marker, el, city: p.kind === "city" });
    }
    map.on("zoom", this.onZoom);
    this.onZoom();
  }

  private onZoom = (): void => {
    const show = this.map.getZoom() >= CITY_MIN_ZOOM;
    if (show === this.citiesShown) return;
    this.citiesShown = show;
    for (const m of this.markers) if (m.city) m.el.style.display = show ? "" : "none";
  };

  destroy(): void {
    this.map.off("zoom", this.onZoom);
    for (const { marker } of this.markers) marker.remove();
    this.markers = [];
  }
}
