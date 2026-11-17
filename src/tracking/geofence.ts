import { PLACES } from "@/data";
import { haversineKm } from "@/lib/geo";
import type { LngLat, Place } from "@/lib/types";

export function inside(place: Place, c: LngLat): boolean {
  return haversineKm(place.coord, c) * 1000 <= place.radiusM;
}

export function inAnyPlace(c: LngLat): boolean {
  for (const p of PLACES) if (inside(p, c)) return true;
  return false;
}
