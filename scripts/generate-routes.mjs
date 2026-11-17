// Genera las rutas reales de la demo con Mapbox Directions y las guarda como
// datos estáticos, para que la app no dependa de la API en tiempo de ejecución.
//
// Uso:  node scripts/generate-routes.mjs
// Lee NEXT_PUBLIC_MAPBOX_TOKEN desde .env.local

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, ".env.local"), "utf8");
const token = env.match(/^NEXT_PUBLIC_MAPBOX_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) throw new Error("Falta NEXT_PUBLIC_MAPBOX_TOKEN en .env.local");

/** Lugares de la operación. coord = [lng, lat] aproximada; se ajusta a la calle más cercana. */
const PLACES = [
  { id: "cd-quilicura", name: "Centro de Distribución Quilicura", shortName: "CD Quilicura", kind: "depot", coord: [-70.7353, -33.3585], radiusM: 700 },
  { id: "cd-pudahuel", name: "Centro de Distribución Pudahuel", shortName: "CD Pudahuel", kind: "depot", coord: [-70.779, -33.403], radiusM: 700 },
  { id: "cd-san-bernardo", name: "Centro de Distribución San Bernardo", shortName: "CD San Bernardo", kind: "depot", coord: [-70.725, -33.632], radiusM: 700 },
  { id: "puerto-san-antonio", name: "Puerto de San Antonio", shortName: "San Antonio", kind: "port", coord: [-71.613, -33.593], radiusM: 1300 },
  { id: "puerto-valparaiso", name: "Puerto de Valparaíso", shortName: "Valparaíso", kind: "port", coord: [-71.627, -33.036], radiusM: 1300 },
  { id: "los-andes", name: "Puerto Terrestre Los Andes", shortName: "Los Andes", kind: "city", coord: [-70.62, -32.85], radiusM: 1500 },
  { id: "paso-libertadores", name: "Complejo Fronterizo Los Libertadores", shortName: "Paso Los Libertadores", kind: "border", coord: [-70.093, -32.827], radiusM: 2000 },
  { id: "mendoza", name: "Mendoza, Argentina", shortName: "Mendoza", kind: "city", coord: [-68.8458, -32.8895], radiusM: 2000 },
  { id: "rancagua", name: "Rancagua", shortName: "Rancagua", kind: "city", coord: [-70.737, -34.165], radiusM: 1500 },
  { id: "talca", name: "Talca", shortName: "Talca", kind: "city", coord: [-71.648, -35.428], radiusM: 1500 },
  { id: "la-serena", name: "La Serena", shortName: "La Serena", kind: "city", coord: [-71.25, -29.91], radiusM: 1500 },
];

/** Pares origen-destino; cada uno se genera en ambos sentidos. */
const PAIRS = [
  ["cd-pudahuel", "puerto-san-antonio", "ruta-78"],
  ["cd-san-bernardo", "puerto-san-antonio", "ruta-78"],
  ["cd-quilicura", "puerto-san-antonio", "ruta-78"],
  ["cd-pudahuel", "puerto-valparaiso", "ruta-68"],
  ["cd-quilicura", "puerto-valparaiso", "ruta-68"],
  ["cd-quilicura", "los-andes", "ruta-57"],
  ["cd-quilicura", "mendoza", "paso-libertadores"],
  ["cd-san-bernardo", "rancagua", "ruta-5-sur"],
  ["cd-san-bernardo", "talca", "ruta-5-sur"],
  ["cd-quilicura", "la-serena", "ruta-5-norte"],
];

/** Corredores: el punto de congestión típico se calcula sobre una ruta de referencia. */
const CORRIDORS = [
  { id: "ruta-78", name: "Ruta 78", label: "Autopista del Sol", ref: "cd-pudahuel__puerto-san-antonio", at: 0.5 },
  { id: "ruta-68", name: "Ruta 68", label: "Santiago – Valparaíso", ref: "cd-pudahuel__puerto-valparaiso", at: 0.45 },
  { id: "ruta-57", name: "Ruta 57", label: "Autopista Los Libertadores", ref: "cd-quilicura__los-andes", at: 0.55 },
  { id: "paso-libertadores", name: "Ruta 60", label: "Paso Los Libertadores", ref: "cd-quilicura__mendoza", at: 0.42 },
  { id: "ruta-5-sur", name: "Ruta 5 Sur", label: "Santiago – Talca", ref: "cd-san-bernardo__rancagua", at: 0.5 },
  { id: "ruta-5-norte", name: "Ruta 5 Norte", label: "Santiago – La Serena", ref: "cd-quilicura__la-serena", at: 0.17 },
];

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Douglas-Peucker iterativo con tolerancia en metros. */
function simplify(coords, tolM) {
  const lat0 = rad(coords[0][1]);
  const pts = coords.map(([lng, lat]) => [rad(lng) * Math.cos(lat0) * R * 1000, rad(lat) * R * 1000]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tolM && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

function pointAtFraction(coords, f) {
  let total = 0;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push((total += haversineKm(coords[i - 1], coords[i])));
  const target = total * f;
  const i = cum.findIndex((d) => d >= target);
  return coords[Math.max(0, i)];
}

/** Distancia (km) a lo largo de la ruta del punto más cercano a `p`, y qué tan lejos queda. */
function nearestAlong(coords, p) {
  let best = { km: 0, offKm: Infinity };
  let acc = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) acc += haversineKm(coords[i - 1], coords[i]);
    const d = haversineKm(coords[i], p);
    if (d < best.offKm) best = { km: acc, offKm: d };
  }
  return best;
}

const round = (n, d = 5) => Number(n.toFixed(d));
const placeById = Object.fromEntries(PLACES.map((p) => [p.id, p]));

async function directions(from, to) {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${from.coord.join(",")};${to.coord.join(",")}` +
    `?geometries=geojson&overview=full&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.routes?.length) throw new Error(`Sin ruta ${from.id} -> ${to.id}: ${json.code}`);
  return json.routes[0];
}

const routes = [];
const border = placeById["paso-libertadores"];

for (const [a, b, corridor] of PAIRS) {
  for (const [fromId, toId] of [[a, b], [b, a]]) {
    const from = placeById[fromId];
    const to = placeById[toId];
    const r = await directions(from, to);
    const full = r.geometry.coordinates;
    // Tolerancia de 1,5 m y 6 decimales (~0,1 m): a zoom cercano el camión debe seguir la calle sin salirse en las curvas.
    const coords = simplify(full, 1.5).map(([lng, lat]) => [round(lng, 6), round(lat, 6)]);
    let distanceKm = 0;
    for (let i = 1; i < coords.length; i++) distanceKm += haversineKm(coords[i - 1], coords[i]);

    // Tiempo de conducción de un camión sin tráfico: más lento que un auto y con tope de ~85 km/h.
    const carMin = r.duration / 60;
    const baseDurationMin = Math.round(Math.max(carMin * 1.2, (distanceKm / 85) * 60));

    const checkpoints = [];
    if (corridor === "paso-libertadores") {
      const n = nearestAlong(coords, border.coord);
      if (n.offKm > 5) console.warn(`  aviso: la frontera queda a ${n.offKm.toFixed(1)} km de la ruta ${fromId} -> ${toId}`);
      checkpoints.push({ placeId: border.id, km: round(n.km, 2), plannedWaitMin: 60 });
    }

    routes.push({
      id: `${fromId}__${toId}`,
      name: `${from.shortName} → ${to.shortName}`,
      corridor,
      originId: fromId,
      destinationId: toId,
      distanceKm: round(distanceKm, 2),
      baseDurationMin,
      checkpoints,
      coordinates: coords,
    });
    console.log(
      `${fromId} -> ${toId}: ${distanceKm.toFixed(0)} km, ${baseDurationMin} min, ${full.length} -> ${coords.length} puntos`,
    );
  }
}

// Ajusta cada lugar al punto real donde empiezan/terminan sus rutas.
const places = PLACES.map((p) => {
  const r = routes.find((x) => x.originId === p.id);
  let coord = r ? r.coordinates[0] : p.coord;
  if (p.kind === "border") {
    const ref = routes.find((x) => x.id === "cd-quilicura__mendoza");
    const cp = ref.checkpoints[0];
    let acc = 0;
    for (let i = 1; i < ref.coordinates.length; i++) {
      acc += haversineKm(ref.coordinates[i - 1], ref.coordinates[i]);
      if (acc >= cp.km) {
        coord = ref.coordinates[i];
        break;
      }
    }
  }
  return { ...p, coord };
});

const corridors = CORRIDORS.map(({ ref, at, ...c }) => {
  const r = routes.find((x) => x.id === ref);
  return { ...c, hotspot: pointAtFraction(r.coordinates, at) };
});

const out = join(root, "src", "data", "generated");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "routes.json"), JSON.stringify(routes));
writeFileSync(join(out, "places.json"), JSON.stringify(places, null, 2));
writeFileSync(join(out, "corridors.json"), JSON.stringify(corridors, null, 2));
const kb = (JSON.stringify(routes).length / 1024).toFixed(0);
console.log(`\nListo: ${routes.length} rutas (${kb} KB), ${places.length} lugares, ${corridors.length} corredores.`);
