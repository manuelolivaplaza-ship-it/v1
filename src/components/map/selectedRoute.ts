import type { Map as MapboxMap } from "mapbox-gl";
import { PLACE_BY_ID } from "@/data";
import { getRouteIndex, projectToRoute, sliceRoute, type RouteIndex } from "@/lib/geo";
import type { LngLat } from "@/lib/types";
import { EMPTY_FC, SRC, setGeoJson, type Feat } from "./config";

/** Mínimo de tiempo y de avance entre dos recortes de ruta (evita reenviar la geometría en cada cuadro). */
const MIN_MS = 100;
const MIN_KM = 0.03;

/** Ruta del camión seleccionado: tramo recorrido gris, tramo pendiente en el color del estado y extremos. */
export class SelectedRoute {
  private idx: RouteIndex | null = null;
  private routeId: string | null = null;
  private color = "";
  private lastKm = -1;
  private lastAt = 0;
  private hintKm = 0;
  private dirty = false;

  constructor(private map: MapboxMap) {}

  /** Define la ruta a mostrar (null = ninguna). Llamar cuando cambia el viaje o el color de estado. */
  setTarget(routeId: string | null, color: string, progressKm: number): void {
    this.hintKm = progressKm;
    if (routeId === this.routeId && color === this.color) return;
    const routeChanged = routeId !== this.routeId;
    this.routeId = routeId;
    this.color = color;
    this.dirty = true;

    if (!routeId) {
      this.idx = null;
      this.lastKm = -1;
      setGeoJson(this.map, SRC.selRoute, EMPTY_FC);
      setGeoJson(this.map, SRC.selEnds, EMPTY_FC);
      return;
    }
    if (routeChanged) {
      try {
        this.idx = getRouteIndex(routeId);
      } catch {
        this.idx = null;
        return;
      }
      this.lastKm = -1;
    }
    this.setEnds();
  }

  private setEnds(): void {
    if (!this.idx) return;
    const r = this.idx.route;
    const o = PLACE_BY_ID[r.originId];
    const d = PLACE_BY_ID[r.destinationId];
    const coords = r.coordinates;
    const features: Feat[] = [
      {
        type: "Feature",
        properties: { role: "origin", tag: "Origen", color: this.color },
        geometry: { type: "Point", coordinates: o?.coord ?? coords[0] },
      },
      {
        type: "Feature",
        properties: { role: "dest", tag: "Destino", color: this.color },
        geometry: { type: "Point", coordinates: d?.coord ?? coords[coords.length - 1] },
      },
    ];
    setGeoJson(this.map, SRC.selEnds, { type: "FeatureCollection", features });
  }

  /** Recorta la ruta en la posición viva del camión para que el límite avance junto con el ícono. */
  update(now: number, live: LngLat | null): void {
    const idx = this.idx;
    if (!idx) return;
    let km = this.hintKm;
    if (live) {
      const proj = projectToRoute(idx, live, this.hintKm, 10);
      if (proj.offRouteKm < 1) km = proj.km;
    }
    const force = this.dirty || this.lastKm < 0;
    if (!force && (now - this.lastAt < MIN_MS || Math.abs(km - this.lastKm) < MIN_KM)) return;
    this.dirty = false;
    this.lastAt = now;
    this.lastKm = km;

    const done = sliceRoute(idx, 0, km);
    const todo = sliceRoute(idx, km, idx.totalKm);
    const features: Feat[] = [
      { type: "Feature", properties: { part: "done", color: this.color }, geometry: { type: "LineString", coordinates: done } },
      { type: "Feature", properties: { part: "todo", color: this.color }, geometry: { type: "LineString", coordinates: todo } },
    ];
    setGeoJson(this.map, SRC.selRoute, { type: "FeatureCollection", features });
  }
}
