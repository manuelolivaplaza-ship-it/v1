import type { Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { displayState, STATE_COLOR } from "@/lib/labels";
import { useFleetStore, type FleetState } from "@/lib/store";
import { CameraController } from "./camera";
import { LYR } from "./config";
import { IncidentLayer } from "./incidents";
import { PlaceLayer } from "./places";
import { registerImages } from "./icons";
import { addLayers } from "./layers";
import { SelectedRing } from "./selectedRing";
import { SelectedRoute } from "./selectedRoute";
import { TruckLayer } from "./trucks";

/** Radio (px) alrededor del cursor en el que se busca un camión. */
const PICK_RADIUS = 10;

/**
 * Orquesta las capas del mapa: se suscribe al store (sin pasar por React), corre el bucle
 * de animación a 60 fps y atiende el cursor y los clics.
 */
export class FleetMapController {
  readonly camera: CameraController;
  private trucks: TruckLayer;
  private route: SelectedRoute;
  private ring: SelectedRing;
  private incidents: IncidentLayer;
  private places: PlaceLayer;

  private raf = 0;
  private lastT = performance.now();
  private pendingFly = false;
  private offs: (() => void)[] = [];

  constructor(private map: MapboxMap) {
    registerImages(map);
    addLayers(map);

    this.trucks = new TruckLayer(map);
    this.route = new SelectedRoute(map);
    this.ring = new SelectedRing(map);
    this.places = new PlaceLayer(map);
    this.incidents = new IncidentLayer(map);
    this.camera = new CameraController(map, () => {
      const id = useFleetStore.getState().selectedVehicleId;
      return id ? this.trucks.getPosition(id) : null;
    }, () => {
      const id = useFleetStore.getState().selectedVehicleId;
      return id && this.trucks.getPosition(id) ? this.trucks.getHeading(id) : null;
    });

    // Estado inicial
    const s = useFleetStore.getState();
    this.trucks.sync(s, performance.now());
    this.incidents.sync(s.incidents);
    this.syncRoute(s);
    this.camera.setLayout(!!s.selectedVehicleId, true);
    this.pendingFly = !!s.selectedVehicleId;

    // Cambios del store: ~10 Hz telemetría, ~4 Hz progreso. Aquí solo se anotan; el dibujo lo hace el bucle.
    this.offs.push(
      useFleetStore.subscribe((next, prev) => {
        if (
          next.telemetry !== prev.telemetry ||
          next.vehicles !== prev.vehicles ||
          next.progress !== prev.progress ||
          next.activeTripByVehicle !== prev.activeTripByVehicle
        ) {
          this.trucks.sync(next, performance.now());
        }
        if (next.incidents !== prev.incidents) this.incidents.sync(next.incidents);
        if (next.selectedVehicleId !== prev.selectedVehicleId) this.camera.setLayout(!!next.selectedVehicleId);
        if (next.selectedVehicleId !== prev.selectedVehicleId && next.selectedVehicleId) this.pendingFly = true;
        if (
          next.selectedVehicleId !== prev.selectedVehicleId ||
          next.progress !== prev.progress ||
          next.activeTripByVehicle !== prev.activeTripByVehicle ||
          next.trips !== prev.trips
        ) {
          this.syncRoute(next);
        }
      }),
    );

    this.bindPointer();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const off of this.offs) off();
    this.offs = [];
    this.camera.destroy();
    this.places.destroy();
    this.incidents.destroy();
    // Si el cursor quedó sobre un camión, no dejar el resaltado colgado
    useFleetStore.getState().setHovered(null);
  }

  private syncRoute(s: FleetState): void {
    const id = s.selectedVehicleId;
    const tripId = id ? (s.activeTripByVehicle[id] ?? null) : null;
    const trip = tripId ? s.trips[tripId] : undefined;
    const p = tripId ? s.progress[tripId] : undefined;
    if (!id || !trip) {
      this.route.setTarget(null, "", 0);
      return;
    }
    this.route.setTarget(trip.routeId, STATE_COLOR[displayState(p)], p?.progressKm ?? 0);
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;

    const s = useFleetStore.getState();
    const sel = s.selectedVehicleId;
    this.trucks.frame(now, sel, s.hoveredVehicleId);

    if (this.pendingFly && sel && this.trucks.getPosition(sel)) {
      this.pendingFly = false;
      // Si ya se sigue, la cámara de persecución hace su propia entrada
      if (!s.followSelected) this.camera.flyToTruck();
    }
    this.route.update(now, sel ? this.trucks.getPosition(sel) : null);
    this.ring.update(sel ? this.trucks.getPosition(sel) : null);
    this.camera.frame(now, dt, s.followSelected && !!sel);
  };

  // ───────────────────────── Cursor y clics ─────────────────────────

  /** Camión más cercano al punto (px), o null. */
  private pick(x: number, y: number): string | null {
    const feats = this.map.queryRenderedFeatures(
      [
        [x - PICK_RADIUS, y - PICK_RADIUS],
        [x + PICK_RADIUS, y + PICK_RADIUS],
      ],
      { layers: [LYR.truckIcon, LYR.truckHead, LYR.truckGlow, LYR.truckHit] },
    );
    let best: string | null = null;
    let bestD = Infinity;
    for (const feat of feats) {
      // El tipo de Mapbox no expone propiedades ni geometría sin @types/geojson
      const f = feat as unknown as { properties?: { id?: unknown }; geometry: { type: string; coordinates: [number, number] } };
      const id = f.properties?.id;
      if (typeof id !== "string" || f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates;
      const p = this.map.project([lng, lat]);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private bindPointer(): void {
    const map = this.map;
    const canvas = map.getCanvas();

    const move = (e: MapMouseEvent) => {
      // Mientras se arrastra no se calcula el resaltado
      if (e.originalEvent && e.originalEvent.buttons) return;
      const id = this.pick(e.point.x, e.point.y);
      canvas.style.cursor = id ? "pointer" : "";
      useFleetStore.getState().setHovered(id);
    };
    const leave = () => {
      canvas.style.cursor = "";
      useFleetStore.getState().setHovered(null);
    };
    const click = (e: MapMouseEvent) => {
      const id = this.pick(e.point.x, e.point.y);
      const st = useFleetStore.getState();
      if (id) {
        if (id !== st.selectedVehicleId) st.selectVehicle(id);
      } else if (st.selectedVehicleId) {
        st.selectVehicle(null);
      }
    };

    map.on("mousemove", move);
    map.on("click", click);
    canvas.addEventListener("mouseleave", leave);
    this.offs.push(() => {
      map.off("mousemove", move);
      map.off("click", click);
      canvas.removeEventListener("mouseleave", leave);
    });
  }
}
