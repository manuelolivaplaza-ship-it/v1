import { PLACE_BY_ID, ROUTE_BY_ID } from "@/data";
import type { Trip, Vehicle } from "@/lib/types";

/** Minúsculas y sin tildes, para buscar "valparaiso" y encontrar "Valparaíso". */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Texto buscable por camión y viaje: son datos estáticos, se calcula una sola vez.
const cache = new Map<string, string>();

/** Unidad, patente, conductor, cliente, origen y destino de un camión, ya normalizados. */
export function vehicleHaystack(vehicle: Vehicle, trip: Trip | null): string {
  const key = `${vehicle.id}|${trip?.id ?? ""}`;
  let h = cache.get(key);
  if (h === undefined) {
    const route = trip ? ROUTE_BY_ID[trip.routeId] : undefined;
    const origin = route ? PLACE_BY_ID[route.originId] : undefined;
    const dest = route ? PLACE_BY_ID[route.destinationId] : undefined;
    h = normalize(
      [
        vehicle.unit,
        vehicle.plate,
        vehicle.driver.name,
        trip?.client,
        trip?.id,
        route?.name,
        origin?.name,
        origin?.shortName,
        dest?.name,
        dest?.shortName,
      ]
        .filter(Boolean)
        .join(" "),
    );
    cache.set(key, h);
  }
  return h;
}
