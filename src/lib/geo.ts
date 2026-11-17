import { ROUTE_BY_ID } from "@/data";
import type { LngLat, RouteDef } from "./types";

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s));
}

/** Rumbo de a hacia b en grados (0 = norte, sentido horario). */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Interpola ángulos por el camino corto (para girar el ícono sin saltos). */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

export function lerpCoord(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Ruta con distancias acumuladas precalculadas. */
export interface RouteIndex {
  route: RouteDef;
  /** km acumulados en cada vértice de `route.coordinates`. */
  cum: Float64Array;
  totalKm: number;
}

const cache = new Map<string, RouteIndex>();

export function getRouteIndex(routeId: string): RouteIndex {
  let idx = cache.get(routeId);
  if (idx) return idx;
  const route = ROUTE_BY_ID[routeId];
  if (!route) throw new Error(`Ruta desconocida: ${routeId}`);
  const cum = new Float64Array(route.coordinates.length);
  for (let i = 1; i < route.coordinates.length; i++) {
    cum[i] = cum[i - 1] + haversineKm(route.coordinates[i - 1], route.coordinates[i]);
  }
  idx = { route, cum, totalKm: cum[cum.length - 1] };
  cache.set(routeId, idx);
  return idx;
}

/** Índice del segmento que contiene el km dado (búsqueda binaria). */
function segmentAt(idx: RouteIndex, km: number): number {
  const { cum } = idx;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= km) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Posición y rumbo a `km` del origen. */
export function pointAtKm(idx: RouteIndex, km: number): { coord: LngLat; heading: number } {
  const coords = idx.route.coordinates;
  const k = Math.max(0, Math.min(idx.totalKm, km));
  const i = segmentAt(idx, k);
  const a = coords[i];
  const b = coords[Math.min(i + 1, coords.length - 1)];
  const segLen = idx.cum[Math.min(i + 1, coords.length - 1)] - idx.cum[i];
  const t = segLen > 0 ? (k - idx.cum[i]) / segLen : 0;
  return { coord: lerpCoord(a, b, t), heading: bearing(a, b) };
}

/**
 * Proyecta una posición GPS sobre la ruta.
 * `hintKm` (el último avance conocido) acota la búsqueda y evita saltos en tramos
 * donde ida y vuelta pasan cerca.
 */
export function projectToRoute(
  idx: RouteIndex,
  coord: LngLat,
  hintKm?: number,
  windowKm = 15,
): { km: number; offRouteKm: number } {
  const coords = idx.route.coordinates;
  let from = 0;
  let to = coords.length - 2;
  if (hintKm !== undefined) {
    from = segmentAt(idx, Math.max(0, hintKm - windowKm));
    to = Math.min(coords.length - 2, segmentAt(idx, Math.min(idx.totalKm, hintKm + windowKm)));
  }
  const cosLat = Math.cos(rad(coord[1]));
  const px = coord[0] * cosLat;
  const py = coord[1];
  let bestD2 = Infinity;
  let bestKm = 0;
  for (let i = from; i <= to; i++) {
    const ax = coords[i][0] * cosLat;
    const ay = coords[i][1];
    const bx = coords[i + 1][0] * cosLat;
    const by = coords[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    const d2 = ex * ex + ey * ey;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestKm = idx.cum[i] + t * (idx.cum[i + 1] - idx.cum[i]);
    }
  }
  return { km: bestKm, offRouteKm: Math.sqrt(bestD2) * rad(1) * R_KM };
}

/** Tramo de la ruta entre dos distancias (para dibujar lo recorrido y lo pendiente). */
export function sliceRoute(idx: RouteIndex, fromKm: number, toKm: number): LngLat[] {
  const coords = idx.route.coordinates;
  const a = Math.max(0, Math.min(idx.totalKm, fromKm));
  const b = Math.max(a, Math.min(idx.totalKm, toKm));
  const out: LngLat[] = [pointAtKm(idx, a).coord];
  const i0 = segmentAt(idx, a) + 1;
  const i1 = segmentAt(idx, b);
  for (let i = i0; i <= i1; i++) out.push(coords[i]);
  out.push(pointAtKm(idx, b).coord);
  return out;
}
