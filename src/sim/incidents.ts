import { haversineKm } from "@/lib/geo";
import type { Incident, LngLat } from "@/lib/types";
import { hash01 } from "./rng";

export const BREAKDOWN_FAULT = "P0217";

/** Incidentes activos y las consultas que hace el movimiento de los camiones. */
export class IncidentBook {
  private list: Incident[] = [];
  private seq = 0;

  nextId(): string {
    return `INC-${String(++this.seq).padStart(3, "0")}`;
  }

  add(inc: Incident): void {
    this.list.push(inc);
  }

  remove(id: string): boolean {
    const n = this.list.length;
    this.list = this.list.filter((i) => i.id !== id);
    return this.list.length !== n;
  }

  /** Quita los vencidos; devuelve true si cambió algo. */
  expire(now: number): boolean {
    const n = this.list.length;
    this.list = this.list.filter((i) => i.endsAt > now);
    return this.list.length !== n;
  }

  all(): Incident[] {
    return this.list.slice();
  }

  clear(): void {
    this.list = [];
  }

  /** Multiplicador de velocidad (1 = sin congestión) para un vehículo en `coord`. */
  congestionFactor(coord: LngLat, vehicleId: string): number {
    let f = 1;
    for (const i of this.list) {
      if (i.kind !== "congestion" || !i.radiusKm) continue;
      if (haversineKm(coord, i.coord) > i.radiusKm) continue;
      // 15–25 % de la velocidad normal, fijo por vehículo e incidente.
      f = Math.min(f, 0.15 + 0.1 * hash01(`${vehicleId}|${i.id}`));
    }
    return f;
  }

  hasBreakdown(vehicleId: string): boolean {
    return this.list.some((i) => i.kind === "breakdown" && i.vehicleId === vehicleId);
  }

  borderClosed(placeId: string): boolean {
    return this.list.some((i) => i.kind === "border_closure" && i.placeId === placeId);
  }

  portDelayed(placeId: string): boolean {
    return this.list.some((i) => i.kind === "port_delay" && i.placeId === placeId);
  }
}
