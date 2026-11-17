import type { Corridor, Place, RouteDef } from "@/lib/types";
import routesJson from "./generated/routes.json";
import placesJson from "./generated/places.json";
import corridorsJson from "./generated/corridors.json";

/** Datos generados por `node scripts/generate-routes.mjs` (geometrías reales de Mapbox Directions). */
export const ROUTES = routesJson as unknown as RouteDef[];
export const PLACES = placesJson as unknown as Place[];
export const CORRIDORS = corridorsJson as unknown as Corridor[];

export const ROUTE_BY_ID: Record<string, RouteDef> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const CORRIDOR_BY_ID: Record<string, Corridor> = Object.fromEntries(CORRIDORS.map((c) => [c.id, c]));

/** Vista inicial del mapa: Santiago y sus corredores hacia la costa. */
export const HOME_VIEW = { center: [-70.95, -33.42] as [number, number], zoom: 8.3 };
