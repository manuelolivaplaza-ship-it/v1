import type { Map as MapboxMap } from "mapbox-gl";
import { HOME_VIEW } from "@/data";
import { haversineKm, lerpAngle } from "@/lib/geo";
import { useFleetStore } from "@/lib/store";
import type { LngLat } from "@/lib/types";
import { PITCH_3D, cameraPadding } from "./config";

interface View {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface Tween {
  t0: number;
  dur: number;
  from: View;
  to: Partial<View>;
  /** El destino de centro es el camión seleccionado (se lee en vivo, porque se mueve). */
  toTruck: boolean;
  /** Cuánto se aleja la cámara a mitad de camino (en niveles de zoom). */
  arc: number;
}

type Padding = ReturnType<typeof cameraPadding>;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Zoom al que se vuela hacia un camión: deja ver contexto sin alejar a quien ya acercó mucho. */
const clampSelectZoom = (z: number) => Math.max(11, z);

/** Cámara de persecución: zoom mínimo al entrar, inclinación y constantes de suavizado (s). */
const CHASE_ZOOM = 17.6;
const CHASE_PITCH = 60;
const CHASE_BEARING_TAU = 0.8;
/** Retraso del centro respecto del camión: corto, porque a 30x el camión recorre mucho por segundo. */
const CHASE_CENTER_TAU = 0.06;

/**
 * Toda la cámara pasa por aquí. Las transiciones y el seguimiento se aplican con `jumpTo` en el bucle
 * de animación (no con `easeTo`), porque `jumpTo` cada cuadro cancelaría cualquier `easeTo` en curso.
 */
export class CameraController {
  private tween: Tween | null = null;
  private padCur: Padding;
  private padTarget: Padding;
  private hasSelection = false;
  /** Modo persecución activo (el seguimiento ya entró en él). */
  private chasing = false;
  /** En persecución, el mapa gira según el rumbo del camión; "Norte arriba" lo apaga. */
  private orient = true;
  private offs: (() => void)[] = [];

  constructor(
    private map: MapboxMap,
    private truckPos: () => LngLat | null,
    private truckHeading: () => number | null,
  ) {
    this.padCur = this.padTarget = this.paddingFor(false);
    // Cualquier gesto del usuario cancela la transición; arrastrar, rotar o inclinar a mano además suelta el seguimiento.
    const user = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) this.tween = null;
    };
    const drag = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
      this.tween = null;
      if (useFleetStore.getState().followSelected) useFleetStore.getState().setFollow(false);
    };
    map.on("dragstart", drag);
    map.on("rotatestart", drag);
    map.on("pitchstart", drag);
    for (const ev of ["zoomstart", "wheel", "touchstart"] as const) map.on(ev, user);
    // Al cambiar el tamaño del contenedor el relleno puede pasar de lateral a inferior (pantallas angostas).
    const onResize = () => this.setLayout(this.hasSelection);
    map.on("resize", onResize);
    this.offs.push(() => {
      map.off("resize", onResize);
      map.off("dragstart", drag);
      map.off("rotatestart", drag);
      map.off("pitchstart", drag);
      for (const ev of ["zoomstart", "wheel", "touchstart"] as const) map.off(ev, user);
    });
  }

  destroy(): void {
    this.tween = null;
    for (const off of this.offs) off();
    this.offs = [];
  }

  private view(): View {
    const c = this.map.getCenter();
    return { center: [c.lng, c.lat], zoom: this.map.getZoom(), pitch: this.map.getPitch(), bearing: this.map.getBearing() };
  }

  /** Ajusta el área visible (panel de detalle y barra de tiempo). La transición la hace el bucle. */
  private paddingFor(hasSelection: boolean): Padding {
    const c = this.map.getContainer();
    // Ancho de la ventana (no del contenedor): es el criterio del panel de detalle (`md` de Tailwind).
    return cameraPadding(hasSelection, window.innerWidth, c.clientHeight, this.chasing);
  }

  setLayout(hasSelection: boolean, immediate = false): void {
    this.hasSelection = hasSelection;
    this.padTarget = this.paddingFor(hasSelection);
    if (immediate) {
      this.padCur = this.padTarget;
      this.map.jumpTo({ padding: this.padCur });
    }
    // La atribución de Mapbox esquiva el panel de detalle.
    const root = this.map.getContainer();
    const right = root.querySelector<HTMLElement>(".mapboxgl-ctrl-bottom-right");
    if (right) {
      right.style.transition = "margin 500ms cubic-bezier(0.16, 1, 0.3, 1)";
      right.style.marginRight = `${this.padTarget.right}px`;
    }
  }

  private start(to: Partial<View>, dur: number, toTruck = false, arc = 0): void {
    this.tween = { t0: performance.now(), dur, from: this.view(), to, toTruck, arc };
  }

  /** Vuelo suave hacia el camión recién seleccionado. */
  flyToTruck(): void {
    const pos = this.truckPos();
    if (!pos) return;
    const here = this.view();
    const dist = haversineKm(here.center, pos);
    this.start({ zoom: clampSelectZoom(here.zoom) }, 1500, true, dist > 60 ? 1.1 : dist > 15 ? 0.5 : 0);
  }

  zoomBy(delta: number): void {
    const base = this.tween?.to.zoom ?? this.map.getZoom();
    const cur = this.tween;
    this.start({ ...(cur?.to ?? {}), zoom: base + delta }, 320, cur?.toTruck ?? false);
  }

  /** Norte arriba. Si se está siguiendo, mantiene el seguimiento pero deja de girar el mapa con el rumbo. */
  resetNorth(): void {
    this.orient = false;
    this.start({ bearing: 0 }, 600);
  }

  toggle3D(): void {
    const pitch = this.map.getPitch();
    this.start({ pitch: pitch > 10 ? 0 : PITCH_3D }, 700);
  }

  resetView(): void {
    if (useFleetStore.getState().followSelected) useFleetStore.getState().setFollow(false);
    this.start({ center: HOME_VIEW.center, zoom: HOME_VIEW.zoom, pitch: PITCH_3D, bearing: 0 }, 1900, false, 0.6);
  }

  /** Entra en persecución: sube a CHASE_ZOOM si estaba más lejos, inclina y orienta según el rumbo. */
  private enterChase(pos: LngLat): void {
    const here = this.view();
    const dist = haversineKm(here.center, pos);
    this.chasing = true;
    this.orient = true;
    this.setLayout(this.hasSelection);
    this.start(
      { zoom: Math.max(here.zoom, CHASE_ZOOM), pitch: CHASE_PITCH, bearing: this.truckHeading() ?? here.bearing },
      1600,
      true,
      dist > 60 ? 1.1 : dist > 15 ? 0.5 : 0,
    );
  }

  private leaveChase(): void {
    this.chasing = false;
    this.setLayout(this.hasSelection);
  }

  /** Un paso de cámara por cuadro. `dt` en segundos. */
  frame(now: number, dt: number, follow: boolean): void {
    const opts: { center?: LngLat; zoom?: number; pitch?: number; bearing?: number; padding?: Padding } = {};

    // Flancos del seguimiento: al empezar entra en persecución; al terminar la cámara se queda donde está.
    if (follow && !this.chasing) {
      const pos = this.truckPos();
      if (pos) this.enterChase(pos);
    } else if (!follow && this.chasing) {
      this.leaveChase();
    }

    // Padding con suavizado exponencial
    const p = this.padCur;
    const g = this.padTarget;
    if (Math.abs(p.right - g.right) > 0.5 || Math.abs(p.bottom - g.bottom) > 0.5 || Math.abs(p.top - g.top) > 0.5) {
      const k = 1 - Math.exp(-dt / 0.14);
      this.padCur = {
        left: 0,
        top: p.top + (g.top - p.top) * k,
        bottom: p.bottom + (g.bottom - p.bottom) * k,
        right: p.right + (g.right - p.right) * k,
      };
      opts.padding = this.padCur;
    } else if (p.right !== g.right || p.bottom !== g.bottom || p.top !== g.top) {
      this.padCur = g;
      opts.padding = g;
    }

    const tw = this.tween;
    if (tw) {
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const e = easeInOut(t);
      const target = tw.toTruck ? this.truckPos() : (tw.to.center ?? null);
      if (target) {
        opts.center = [
          tw.from.center[0] + (target[0] - tw.from.center[0]) * e,
          tw.from.center[1] + (target[1] - tw.from.center[1]) * e,
        ];
      }
      if (tw.to.zoom !== undefined) {
        opts.zoom = tw.from.zoom + (tw.to.zoom - tw.from.zoom) * e - tw.arc * Math.sin(Math.PI * e);
      }
      if (tw.to.pitch !== undefined) opts.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * e;
      if (tw.to.bearing !== undefined) opts.bearing = lerpAngle(tw.from.bearing, tw.to.bearing, e);
      if (t >= 1) this.tween = null;
    } else if (follow) {
      const pos = this.truckPos();
      if (pos) {
        const c = this.map.getCenter();
        const k = 1 - Math.exp(-dt / CHASE_CENTER_TAU);
        opts.center = [c.lng + (pos[0] - c.lng) * k, c.lat + (pos[1] - c.lat) * k];
      }
      // El mapa gira con el rumbo del camión, con un suavizado largo para que no baile
      const hd = this.orient ? this.truckHeading() : null;
      if (hd !== null) opts.bearing = lerpAngle(this.map.getBearing(), hd, 1 - Math.exp(-dt / CHASE_BEARING_TAU));
    }

    if (Object.keys(opts).length > 0) this.map.jumpTo(opts);
  }
}
