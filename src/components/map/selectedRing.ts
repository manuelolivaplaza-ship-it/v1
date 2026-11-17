import type { Map as MapboxMap } from "mapbox-gl";
import type { LngLat } from "@/lib/types";
import { EMPTY_FC, SRC, TRUCK_LENGTH_M, exaggeration, setGeoJson, type FC } from "./config";

/** Radio del aro respecto del largo del camión en pantalla. */
const RING_K = 0.62;
const SEGMENTS = 56;
/** Debajo de este zoom el aro de pie (círculo en pantalla) hace el trabajo. */
const MIN_ZOOM = 13;
const M_PER_DEG_LAT = 111320;

/**
 * Aro de selección a zoom cercano: un polígono en coordenadas del mapa, centrado en el camión, con
 * radio en metros (0,62 × el largo exagerado). Al ser geometría del mapa se apoya sobre el suelo,
 * con perspectiva y sobre el relieve, igual que las rutas.
 */
export class SelectedRing {
  private empty = true;

  constructor(private map: MapboxMap) {}

  update(pos: LngLat | null): void {
    const zoom = this.map.getZoom();
    if (!pos || zoom < MIN_ZOOM) {
      if (!this.empty) {
        setGeoJson(this.map, SRC.selRing, EMPTY_FC);
        this.empty = true;
      }
      return;
    }
    const r = RING_K * TRUCK_LENGTH_M * exaggeration(zoom);
    const dLat = r / M_PER_DEG_LAT;
    const dLng = r / (M_PER_DEG_LAT * Math.cos((pos[1] * Math.PI) / 180));
    const ring: LngLat[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      ring.push([pos[0] + Math.cos(a) * dLng, pos[1] + Math.sin(a) * dLat]);
    }
    const data: FC = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
    };
    setGeoJson(this.map, SRC.selRing, data);
    this.empty = false;
  }
}
