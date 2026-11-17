import type { Map as MapboxMap } from "mapbox-gl";
import { STATE_COLOR } from "@/lib/labels";
import { ALL_STATES } from "./config";

const DPR = 2;

function makeCanvas(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = size * DPR;
  canvas.height = size * DPR;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return ctx;
}

function toImage(ctx: CanvasRenderingContext2D): ImageData {
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Insignia: círculo de 26 px del color del estado, borde blanco de 2 px, sombra sutil y camión blanco de lado. */
function drawTruckBadge(color: string): ImageData {
  const size = 40;
  const c = size / 2;
  const ctx = makeCanvas(size);

  ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(c, c, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c, c, 11, 0, Math.PI * 2);
  ctx.fill();

  // Pictograma mirando a la derecha: caja de carga, cabina y dos ruedas
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(11.5, 14, 9.5, 9, 1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, 16.5);
  ctx.lineTo(25, 16.5);
  ctx.lineTo(28.5, 20);
  ctx.lineTo(28.5, 23);
  ctx.lineTo(22, 23);
  ctx.closePath();
  ctx.fill();
  for (const x of [15.5, 24.5]) {
    ctx.beginPath();
    ctx.arc(x, 24.2, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  return toImage(ctx);
}

/**
 * Cuña de rumbo: chevron del color del estado con borde blanco fino, apoyado sobre el borde de la
 * insignia en la dirección de avance (norte en la imagen; se rota con `icon-rotate`).
 * Imagen cuadrada de 56 px con el centro transparente, para que gire alrededor de la insignia.
 */
function drawHeading(color: string): ImageData {
  const size = 56;
  const ctx = makeCanvas(size);
  const path = new Path2D();
  path.moveTo(28, 3.5);
  path.lineTo(39, 16);
  path.lineTo(28, 11);
  path.lineTo(17, 16);
  path.closePath();

  ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke(path);
  return toImage(ctx);
}

/** Registra todas las imágenes que usan las capas de símbolos. */
export function registerImages(map: MapboxMap): void {
  for (const state of ALL_STATES) {
    const badge = `truck-${state}`;
    if (!map.hasImage(badge)) map.addImage(badge, drawTruckBadge(STATE_COLOR[state]), { pixelRatio: DPR });
    const head = `truck-head-${state}`;
    if (!map.hasImage(head)) map.addImage(head, drawHeading(STATE_COLOR[state]), { pixelRatio: DPR });
  }
}
