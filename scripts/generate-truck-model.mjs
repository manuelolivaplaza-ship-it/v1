// Genera el modelo 3D del tractocamión (glTF binario) para la capa `model` de Mapbox.
// Una variante por estado: lo único que cambia es el color de la franja del remolque.
//
// Uso:  node scripts/generate-truck-model.mjs
// Salida: public/models/truck-<estado>.glb
//
// Convención del modelo: unidades en metros, Y arriba, el frente del camión hacia +Z,
// origen a ras de suelo en el centro del largo total (≈ 16,7 m).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "models");
mkdirSync(outDir, { recursive: true });

/** Color de la franja por estado (los mismos de STATE_COLOR en src/lib/labels.ts). */
const STATE_ACCENT = {
  on_time: "#1fa971",
  at_risk: "#f5a524",
  delayed: "#e5484d",
  stopped: "#64748b",
  offline: "#9aa3b2",
  scheduled: "#7c8db5",
  completed: "#a1a1aa",
  idle: "#a1a1aa",
};

// ───────────────────────── Utilidades ─────────────────────────

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// ───────────────────────── Malla ─────────────────────────

/** Acumula geometría por material: posiciones, normales e índices. */
class Mesh {
  constructor() {
    this.prims = new Map();
  }
  prim(mat) {
    if (!this.prims.has(mat)) this.prims.set(mat, { pos: [], nor: [], idx: [] });
    return this.prims.get(mat);
  }
  /** Cuadrilátero plano; los vértices ya vienen con la orientación exterior correcta. */
  quad(mat, a, b, c, d) {
    const p = this.prim(mat);
    const n = norm(cross(sub(b, a), sub(c, a)));
    const base = p.pos.length / 3;
    for (const v of [a, b, c, d]) {
      p.pos.push(...v);
      p.nor.push(...n);
    }
    p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /**
   * Hexaedro convexo a partir de 8 vértices: 0-3 la cara de abajo y 4-7 la de arriba, en el mismo orden.
   * Orienta cada cara hacia afuera por sí solo, así no hay que razonar sobre el sentido de giro.
   */
  hexa(mat, c) {
    const centroid = [0, 1, 2].map((i) => c.reduce((s, v) => s + v[i], 0) / 8);
    const faces = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    for (const f of faces) {
      let [a, b, cc, d] = f.map((i) => c[i]);
      const n = cross(sub(b, a), sub(cc, a));
      const center = [0, 1, 2].map((i) => (a[i] + b[i] + cc[i] + d[i]) / 4);
      if (dot(n, sub(center, centroid)) < 0) [a, b, cc, d] = [d, cc, b, a];
      this.quad(mat, a, b, cc, d);
    }
  }
  /** Caja alineada a los ejes. */
  box(mat, x0, y0, z0, x1, y1, z1) {
    this.hexa(mat, [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ]);
  }
  /** Cilindro de eje `axis` centrado en (cx, cy, cz), con paredes suaves y tapas planas. */
  cyl(mat, cx, cy, cz, r, len, axis = "x", segs = 22) {
    const p = this.prim(mat);
    const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    const ax = axes[axis];
    const u = axis === "x" ? [0, 1, 0] : axis === "y" ? [1, 0, 0] : [1, 0, 0];
    const v = norm(cross(ax, u));
    const ring = (t) => {
      const a = (t / segs) * Math.PI * 2;
      return [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)];
    };
    const half = len / 2;
    const at = (radial, s) => [cx + radial[0] * r + ax[0] * s, cy + radial[1] * r + ax[1] * s, cz + radial[2] * r + ax[2] * s];
    // Pared lateral con normales radiales
    for (let i = 0; i < segs; i++) {
      const r0 = ring(i);
      const r1 = ring(i + 1);
      const base = p.pos.length / 3;
      for (const [rad, s] of [
        [r0, -half],
        [r1, -half],
        [r1, half],
        [r0, half],
      ]) {
        p.pos.push(...at(rad, s));
        p.nor.push(...rad);
      }
      // Orientación exterior: se comprueba con la normal radial
      const a = at(r0, -half);
      const b = at(r1, -half);
      const c = at(r1, half);
      const n = cross(sub(b, a), sub(c, a));
      if (dot(n, r0) >= 0) p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else p.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // Tapas
    for (const sign of [-1, 1]) {
      const centerIdx = p.pos.length / 3;
      p.pos.push(cx + ax[0] * half * sign, cy + ax[1] * half * sign, cz + ax[2] * half * sign);
      p.nor.push(ax[0] * sign, ax[1] * sign, ax[2] * sign);
      const first = p.pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const rad = ring(i);
        p.pos.push(...at(rad, half * sign));
        p.nor.push(ax[0] * sign, ax[1] * sign, ax[2] * sign);
      }
      for (let i = 0; i < segs; i++) {
        const a = [p.pos[(first + i) * 3], p.pos[(first + i) * 3 + 1], p.pos[(first + i) * 3 + 2]];
        const b = [p.pos[(first + i + 1) * 3], p.pos[(first + i + 1) * 3 + 1], p.pos[(first + i + 1) * 3 + 2]];
        const c = [p.pos[centerIdx * 3], p.pos[centerIdx * 3 + 1], p.pos[centerIdx * 3 + 2]];
        const n = cross(sub(b, a), sub(c, a));
        if (dot(n, ax) * sign >= 0) p.idx.push(first + i, first + i + 1, centerIdx);
        else p.idx.push(first + i + 1, first + i, centerIdx);
      }
    }
  }
}

// ───────────────────────── Materiales ─────────────────────────

const MAT = {
  paint: { name: "pintura", color: "#f4f5f7", metallic: 0.05, rough: 0.55 },
  cab: { name: "cabina", color: "#2f343c", metallic: 0.2, rough: 0.45 },
  dark: { name: "plastico", color: "#1d2127", metallic: 0.1, rough: 0.7 },
  glass: { name: "vidrio", color: "#17232f", metallic: 0.5, rough: 0.12 },
  tire: { name: "neumatico", color: "#101113", metallic: 0.0, rough: 0.9 },
  rim: { name: "llanta", color: "#bcc2cb", metallic: 0.85, rough: 0.35 },
  chrome: { name: "cromo", color: "#d3d8df", metallic: 0.9, rough: 0.25 },
  head: { name: "faro", color: "#fff7da", metallic: 0, rough: 0.3, emissive: [1.0, 0.95, 0.75] },
  tail: { name: "luz trasera", color: "#d93a3a", metallic: 0, rough: 0.4, emissive: [0.85, 0.08, 0.08] },
  amber: { name: "gabarito", color: "#f5a524", metallic: 0, rough: 0.4, emissive: [0.8, 0.45, 0.05] },
  accent: { name: "franja", color: "#1fa971", metallic: 0.1, rough: 0.5 },
};

// ───────────────────────── Geometría del camión ─────────────────────────

function buildTruck(accentHex) {
  const m = new Mesh();
  const HW = 1.28; // semiancho de la caja y la cabina
  const L = 16.7;
  const zFront = L / 2; // 8,35
  const zRear = -L / 2; // -8,35
  const cabBack = zFront - 2.4; // 5,95
  const trailerFront = cabBack - 0.7; // 5,25

  // — Chasis del tractor: dos largueros bajo la cabina y hasta pasada la quinta rueda —
  for (const s of [-1, 1]) m.box("dark", s * 0.55 - 0.1, 0.7, -0.9, s * 0.55 + 0.1, 1.0, zFront - 0.25);
  m.box("dark", -0.7, 0.72, 5.6, 0.7, 0.98, 5.8); // travesaño tras la cabina
  m.cyl("dark", 0, 1.07, 1.0, 0.55, 0.12, "y", 28); // quinta rueda
  m.box("dark", -0.55, 1.01, -0.2, 0.55, 1.1, 2.2); // placa de la quinta rueda

  // — Tractor: cabina avanzada —
  m.box("cab", -HW, 0.95, cabBack, HW, 2.0, zFront); // parte baja de la cabina
  m.hexa("cab", [
    [-HW, 2.0, cabBack],
    [HW, 2.0, cabBack],
    [HW, 2.0, zFront],
    [-HW, 2.0, zFront],
    [-HW + 0.03, 3.2, cabBack],
    [HW - 0.03, 3.2, cabBack],
    [HW - 0.03, 3.2, zFront - 0.42],
    [-HW + 0.03, 3.2, zFront - 0.42],
  ]); // parte alta, con el frente inclinado
  // Parabrisas
  m.hexa("glass", [
    [-1.17, 2.12, zFront + 0.005],
    [1.17, 2.12, zFront + 0.005],
    [1.17, 2.12, zFront - 0.03],
    [-1.17, 2.12, zFront - 0.03],
    [-1.17, 3.08, zFront - 0.42 + 0.005],
    [1.17, 3.08, zFront - 0.42 + 0.005],
    [1.17, 3.08, zFront - 0.42 - 0.03],
    [-1.17, 3.08, zFront - 0.42 - 0.03],
  ]);
  // Ventanas laterales
  for (const s of [-1, 1]) m.box("glass", s * (HW - 0.005) - 0.015, 2.2, cabBack + 0.35, s * (HW - 0.005) + 0.015, 2.95, zFront - 0.75);
  // Defensa, parrilla y faros
  m.box("dark", -HW + 0.02, 0.78, zFront - 0.14, HW - 0.02, 1.05, zFront + 0.14);
  m.box("dark", -0.85, 1.4, zFront - 0.02, 0.85, 1.95, zFront + 0.02);
  for (let i = 0; i < 4; i++) m.box("chrome", -0.8, 1.5 + i * 0.12, zFront + 0.01, 0.8, 1.55 + i * 0.12, zFront + 0.03);
  for (const s of [-1, 1]) {
    m.box("head", s * 1.0 - 0.17, 1.2, zFront - 0.01, s * 1.0 + 0.17, 1.42, zFront + 0.04);
    m.box("amber", s * 1.12 - 0.1, 1.5, zFront - 0.01, s * 1.12 + 0.1, 1.58, zFront + 0.03);
  }
  // Deflector de techo
  m.hexa("paint", [
    [-1.1, 3.2, cabBack],
    [1.1, 3.2, cabBack],
    [1.1, 3.2, cabBack + 1.5],
    [-1.1, 3.2, cabBack + 1.5],
    [-1.1, 3.95, cabBack],
    [1.1, 3.95, cabBack],
    [1.1, 3.55, cabBack + 1.5],
    [-1.1, 3.55, cabBack + 1.5],
  ]);
  for (let i = -2; i <= 2; i++) m.box("amber", i * 0.28 - 0.05, 3.27, zFront - 0.7, i * 0.28 + 0.05, 3.33, zFront - 0.55); // luces de techo
  // Espejos
  for (const s of [-1, 1]) {
    m.box("dark", s * 1.31 - 0.015, 2.5, zFront - 0.62, s * 1.31 + 0.015, 2.62, zFront - 0.52);
    m.box("dark", s * 1.55 - 0.05, 2.15, zFront - 0.62, s * 1.55 + 0.05, 2.85, zFront - 0.48);
  }
  // Franja de la cabina (puertas)
  for (const s of [-1, 1]) m.box("accent", s * (HW + 0.004) - 0.006, 1.25, cabBack + 0.3, s * (HW + 0.004) + 0.006, 1.5, zFront - 0.5);
  // Escalones
  for (const s of [-1, 1]) m.box("dark", s * 1.2 - 0.12, 0.55, zFront - 1.2, s * 1.2 + 0.12, 0.62, zFront - 0.6);
  // Escape y estanques
  for (const s of [-1, 1]) m.cyl("chrome", s * 1.18, 2.35, cabBack - 0.12, 0.07, 2.7, "y", 12);
  for (const s of [-1, 1]) m.cyl("chrome", s * 0.95, 0.8, 3.4, 0.36, 1.7, "z", 20);

  // — Semirremolque —
  const tl = trailerFront;
  const tr = zRear;
  m.box("dark", -1.0, 1.05, tr + 0.1, 1.0, 1.25, tl); // chasis del remolque
  m.box("paint", -HW, 1.25, tr, HW, 4.0, tl); // caja
  // Aristas del techo un poco redondeadas
  for (const s of [-1, 1]) m.box("paint", s * (HW - 0.04) - 0.05, 3.98, tr + 0.02, s * (HW - 0.04) + 0.05, 4.06, tl - 0.02);
  // Franja del estado a lo largo de los costados y por el techo
  for (const s of [-1, 1]) m.box("accent", s * (HW + 0.005) - 0.008, 2.4, tr + 0.25, s * (HW + 0.005) + 0.008, 2.95, tl - 0.25);
  m.box("accent", -0.28, 4.0, tr + 0.3, 0.28, 4.016, tl - 0.3);
  m.box("accent", -HW + 0.02, 3.55, tl - 0.02, HW - 0.02, 3.95, tl + 0.012); // cara delantera del remolque
  // Faldones laterales y parachoques trasero
  for (const s of [-1, 1]) m.box("paint", s * (HW - 0.03) - 0.02, 0.9, tr + 4.0, s * (HW - 0.03) + 0.02, 1.25, tl - 1.2);
  m.box("dark", -1.15, 0.55, tr - 0.18, 1.15, 0.82, tr + 0.02);
  // Puertas traseras y luces
  m.box("dark", -HW + 0.04, 1.35, tr - 0.012, HW - 0.04, 3.9, tr + 0.01);
  m.box("paint", -0.012, 1.4, tr - 0.02, 0.012, 3.85, tr + 0.015); // junta de las puertas
  for (const s of [-1, 1]) {
    m.box("tail", s * 1.1 - 0.12, 1.45, tr - 0.025, s * 1.1 + 0.12, 1.75, tr + 0.01);
    m.box("tail", s * 1.1 - 0.12, 3.45, tr - 0.025, s * 1.1 + 0.12, 3.7, tr + 0.01);
  }
  // Luces de gálibo ámbar en los costados
  for (let z = tr + 1.2; z < tl - 0.8; z += 2.1) {
    for (const s of [-1, 1]) m.box("amber", s * (HW + 0.006) - 0.008, 3.84, z, s * (HW + 0.006) + 0.008, 3.92, z + 0.18);
  }
  // Patas de apoyo
  for (const s of [-1, 1]) m.box("dark", s * 0.9 - 0.06, 0.45, tl - 1.3, s * 0.9 + 0.06, 1.1, tl - 1.18);

  // — Ruedas: eje delantero sencillo, ejes motrices y del remolque con ruedas gemelas —
  const wheel = (x, z, outer) => {
    m.cyl("tire", x, 0.52, z, 0.52, 0.28, "x", 24);
    m.cyl("rim", x + outer * 0.005, 0.52, z, 0.31, 0.29, "x", 18);
    m.cyl("chrome", x + outer * 0.01, 0.52, z, 0.1, 0.3, "x", 12);
  };
  for (const s of [-1, 1]) wheel(s * 1.12, zFront - 1.45, s);
  for (const z of [0.7, -0.6]) for (const s of [-1, 1]) for (const x of [0.76, 1.1]) wheel(s * x, z, s);
  for (const z of [tr + 2.9, tr + 1.6, tr + 0.3 + 0.0]) for (const s of [-1, 1]) for (const x of [0.76, 1.1]) wheel(s * x, z + 0.0, s);
  // Guardabarros
  for (const s of [-1, 1]) {
    m.box("dark", s * 1.12 - 0.17, 1.02, zFront - 1.95, s * 1.12 + 0.17, 1.08, zFront - 0.95);
    for (const z of [0.7, -0.6]) m.box("dark", s * 0.93 - 0.3, 1.04, z - 0.6, s * 0.93 + 0.3, 1.1, z + 0.6);
  }

  return m;
}

// ───────────────────────── Escritura del GLB ─────────────────────────

function toGlb(mesh, accentHex) {
  const materials = [];
  const matIndex = new Map();
  const bufs = [];
  const bufferViews = [];
  const accessors = [];
  const prims = [];
  let offset = 0;

  const push = (typed, target) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    bufs.push(buf, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    offset += buf.length + pad;
    return bufferViews.length - 1;
  };

  for (const [key, data] of mesh.prims) {
    const def = { ...MAT[key] };
    if (key === "accent") def.color = accentHex;
    const mat = {
      name: def.name,
      pbrMetallicRoughness: { baseColorFactor: [...hex(def.color), 1], metallicFactor: def.metallic, roughnessFactor: def.rough },
    };
    if (def.emissive) mat.emissiveFactor = def.emissive;
    matIndex.set(key, materials.length);
    materials.push(mat);

    const pos = new Float32Array(data.pos);
    const nor = new Float32Array(data.nor);
    const idx = new Uint32Array(data.idx);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }
    const aPos = accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: pos.length / 3, type: "VEC3", min, max }) - 1;
    const aNor = accessors.push({ bufferView: push(nor, 34962), componentType: 5126, count: nor.length / 3, type: "VEC3" }) - 1;
    const aIdx = accessors.push({ bufferView: push(idx, 34963), componentType: 5125, count: idx.length, type: "SCALAR" }) - 1;
    prims.push({ attributes: { POSITION: aPos, NORMAL: aNor }, indices: aIdx, material: matIndex.get(key) });
  }

  const json = {
    asset: { version: "2.0", generator: "traza generate-truck-model" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "tractocamion" }],
    meshes: [{ name: "tractocamion", primitives: prims }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binBuf = Buffer.concat(bufs);

  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBuf.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binBuf.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4); // "BIN\0"
  return Buffer.concat([header, jsonHead, jsonBuf, binHead, binBuf]);
}

for (const [state, accent] of Object.entries(STATE_ACCENT)) {
  const glb = toGlb(buildTruck(accent), accent);
  writeFileSync(join(outDir, `truck-${state}.glb`), glb);
  console.log(`truck-${state}.glb  ${(glb.length / 1024).toFixed(0)} KB`);
}
