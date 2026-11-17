import { PLACES, ROUTES, ROUTE_BY_ID } from "@/data";
import { getRouteIndex, haversineKm, pointAtKm } from "@/lib/geo";
import { RULES, committedArrivalFor, planRoute } from "@/lib/planning";
import type { RouteDef, Scenario, TrailerType, Trip, Vehicle } from "@/lib/types";
import {
  FIRST_NAMES,
  LAST_NAMES,
  PLATE_LETTERS,
  TRAILER_POOL,
  TRUCK_MODELS,
  cargoFor,
  trailerFits,
} from "./catalog";
import { mulberry32, pick, rfloat, rint, shuffle, type Rng } from "./rng";

const MIN = 60_000;
/** Minutos del día → índice cómodo. */
const hm = (h: number, m = 0) => h * 60 + m;

/** Parámetros ocultos de un viaje (lo que "pasa" y el plan no sabe). */
export interface TripScript {
  /** Minutos extra de carga sobre lo planificado. */
  extraLoadMin: number;
  /** Detención no planificada en carretera. */
  stop?: { km: number; durMin: number };
  /** Sesgo de velocidad del viaje (fracción, ±0,025). */
  bias: number;
  /** Fases del ruido suave de velocidad. */
  p1: number;
  p2: number;
}

export interface DayPlan {
  scenario: Scenario;
  scripts: Record<string, TripScript>;
}

/** Medianoche local de la fecha dada. */
export function localMidnight(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ───────────────────────── Flota ─────────────────────────

function buildVehicles(rng: Rng): Vehicle[] {
  const plates = new Set<string>();
  const names = new Set<string>();
  const vehicles: Vehicle[] = [];
  for (let i = 1; i <= 30; i++) {
    let plate = "";
    do {
      const l = () => PLATE_LETTERS[Math.floor(rng() * PLATE_LETTERS.length)];
      plate = `${l()}${l()}${l()}${l()}-${rint(rng, 10, 99)}`;
    } while (plates.has(plate));
    plates.add(plate);

    let name = "";
    do {
      name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    } while (names.has(name));
    names.add(name);

    const n = String(i).padStart(2, "0");
    vehicles.push({
      id: `v-${n}`,
      unit: `T-${n}`,
      plate,
      model: pick(rng, TRUCK_MODELS),
      trailer: "dry_van",
      driver: { name, phone: `+56 9 ${rint(rng, 5000, 5999)} ${String(rint(rng, 0, 9999)).padStart(4, "0")}` },
      fuelCapacityL: rint(rng, 12, 16) * 50,
    });
  }
  return vehicles;
}

// ───────────────────────── Viajes ─────────────────────────

interface Draft {
  vi: number;
  route: RouteDef;
  loadStart: number;
  loadMin: number;
  unloadMin: number;
  departure: number;
  committed: number;
}

interface Slot {
  /** Rutas posibles para el primer viaje; "short" = rutas cortas de la costa/Los Andes/Rancagua. */
  routes: string[] | "short";
  /** Ventana de inicio de carga, en minutos del día. */
  from: number;
  to: number;
  /** Espera máxima extra antes del viaje siguiente. */
  slackMax: number;
}

/**
 * Reparto de camiones para que a las 09:30 haya ~18 en carretera, algunos cargando,
 * algunos programados y pocos completados.
 */
const SLOTS: Slot[] = [
  { routes: ["cd-quilicura__la-serena"], from: hm(4, 30), to: hm(5, 30), slackMax: 45 },
  { routes: ["cd-quilicura__la-serena", "la-serena__cd-quilicura"], from: hm(4, 45), to: hm(5, 45), slackMax: 45 },
  { routes: ["cd-quilicura__mendoza"], from: hm(5), to: hm(5, 45), slackMax: 45 },
  { routes: ["cd-quilicura__mendoza", "mendoza__cd-quilicura"], from: hm(5, 15), to: hm(6, 15), slackMax: 45 },
  { routes: ["cd-san-bernardo__talca"], from: hm(4, 30), to: hm(5, 15), slackMax: 60 },
  { routes: ["cd-san-bernardo__talca", "talca__cd-san-bernardo"], from: hm(6, 45), to: hm(7, 30), slackMax: 60 },
  ...Array.from({ length: 3 }, (): Slot => ({ routes: "short", from: hm(4, 30), to: hm(6, 15), slackMax: 150 })),
  ...Array.from({ length: 14 }, (): Slot => ({ routes: "short", from: hm(7, 10), to: hm(8, 50), slackMax: 75 })),
  ...Array.from({ length: 3 }, (): Slot => ({ routes: "short", from: hm(8, 50), to: hm(9, 35), slackMax: 60 })),
  ...Array.from({ length: 4 }, (): Slot => ({ routes: "short", from: hm(10), to: hm(15), slackMax: 45 })),
];

const SHORT_ROUTES = ROUTES.filter((r) => r.baseDurationMin <= 110);
const LAST_DEPARTURE = hm(17);
const ROUTES_BY_ORIGIN: Record<string, RouteDef[]> = {};
for (const r of ROUTES) (ROUTES_BY_ORIGIN[r.originId] ??= []).push(r);

/** Elige entre rutas dando más peso a las que parten de un centro de distribución. */
function weightedRoute(rng: Rng, routes: RouteDef[]): RouteDef {
  const w = routes.map((r) => (r.originId.startsWith("cd-") ? 2 : 1));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < routes.length; i++) {
    x -= w[i];
    if (x <= 0) return routes[i];
  }
  return routes[routes.length - 1];
}

function makeDraft(rng: Rng, vi: number, route: RouteDef, loadStart: number): Draft {
  const loadMin = 30 + 5 * rint(rng, 0, 6);
  const unloadMin = 30 + 5 * rint(rng, 0, 6);
  const departure = loadStart + loadMin * MIN;
  return { vi, route, loadStart, loadMin, unloadMin, departure, committed: committedArrivalFor(route, departure) };
}

/** Minutos de conducción acumulados desde el último descanso tras un tramo. */
const drivenAfter = (min: number) => min % RULES.maxContinuousDrivingMin;

function buildTrips(rng: Rng, vehicles: Vehicle[], dayStart: number, startAt: number): Draft[] {
  const at = (minutes: number) => dayStart + minutes * MIN;
  const order = shuffle(rng, vehicles.map((_, i) => i));
  const pool = shuffle(rng, TRAILER_POOL);
  const chains: Draft[][] = vehicles.map(() => []);

  SLOTS.forEach((slot, si) => {
    const vi = order[si];
    const candidates: RouteDef[] =
      slot.routes === "short" ? SHORT_ROUTES : slot.routes.map((id) => ROUTE_BY_ID[id]).filter(Boolean);

    // Remolque de la bolsa que calce con alguna ruta del hueco.
    let chosen = -1;
    let routes: RouteDef[] = candidates;
    for (let k = 0; k < pool.length && chosen < 0; k++) {
      const ok = candidates.filter((r) => trailerFits(pool[k], r));
      if (ok.length) {
        chosen = k;
        routes = ok;
      }
    }
    if (chosen < 0) chosen = 0;
    vehicles[vi].trailer = pool.splice(chosen, 1)[0] as TrailerType;

    const route = weightedRoute(rng, routes);
    const loadStart = at(Math.round(rfloat(rng, slot.from, slot.to) / 5) * 5);
    let cur = makeDraft(rng, vi, route, loadStart);
    const trips = [cur];
    let cum = drivenAfter(route.baseDurationMin);

    // Viajes encadenados: el siguiente parte donde terminó el anterior.
    while (trips.length < 5) {
      const back = ROUTE_BY_ID[`${cur.route.destinationId}__${cur.route.originId}`];
      const alt = (ROUTES_BY_ORIGIN[cur.route.destinationId] ?? []).filter((r) => trailerFits(vehicles[vi].trailer, r));
      const next = back && (rng() < 0.75 || alt.length === 0) ? back : alt.length ? pick(rng, alt) : back;
      if (!next) break;
      const drive = next.baseDurationMin;
      const loadMin = 30 + 5 * rint(rng, 0, 6);
      let ls = cur.committed + cur.unloadMin * MIN + rint(rng, 0, slot.slackMax / 5) * 5 * MIN;
      // Con más de ~280 min de conducción acumulada, el conductor necesita ≥150 min detenido.
      const needRest = cum + drive > 280;
      if (needRest) ls = Math.max(ls, cur.committed + 150 * MIN - loadMin * MIN);
      ls = Math.ceil((ls - dayStart) / (5 * MIN)) * 5 * MIN + dayStart;
      if (ls + loadMin * MIN > at(LAST_DEPARTURE)) break;
      const d = makeDraft(rng, vi, next, ls);
      d.loadMin = loadMin;
      d.departure = ls + loadMin * MIN;
      d.committed = committedArrivalFor(next, d.departure);
      const before = d.departure - cur.committed >= 150 * MIN ? 0 : cum;
      cum = drivenAfter(before + drive);
      trips.push(d);
      cur = d;
    }
    chains[vi] = trips;
  });

  // Se recorta el día a ~50 viajes quitando los últimos de la tarde.
  const target = rint(rng, 48, 52);
  let total = chains.reduce((s, c) => s + c.length, 0);
  while (total > target) {
    const cand = chains
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.length >= 2 && c[c.length - 1].loadStart >= startAt);
    if (!cand.length) break;
    const weights = cand.map(({ c }) => c.length);
    let x = rng() * weights.reduce((a, b) => a + b, 0);
    let k = 0;
    for (; k < cand.length - 1; k++) {
      x -= weights[k];
      if (x <= 0) break;
    }
    cand[k].c.pop();
    total--;
  }
  return chains.flat();
}

/** Km de una detención no planificada: lejos de toda geocerca. */
function pickStopKm(rng: Rng, route: RouteDef, fromFrac: number, toFrac: number): number {
  const idx = getRouteIndex(route.id);
  let km = idx.totalKm * rfloat(rng, fromFrac, toFrac);
  for (let t = 0; t < 20; t++) {
    km = idx.totalKm * rfloat(rng, fromFrac, toFrac);
    const c = pointAtKm(idx, km).coord;
    if (PLACES.every((p) => haversineKm(c, p.coord) > p.radiusM / 1000 + 1.5)) return km;
  }
  return km;
}

// ───────────────────────── Día completo ─────────────────────────

export function buildDay(seed: number, dayStart: number): DayPlan {
  const rng = mulberry32(seed);
  const startAt = dayStart + hm(9, 30) * MIN;
  const at = (minutes: number) => dayStart + minutes * MIN;

  const vehicles = buildVehicles(rng);
  const drafts = buildTrips(rng, vehicles, dayStart, startAt).sort(
    (a, b) => a.loadStart - b.loadStart || a.vi - b.vi,
  );

  const trips: Trip[] = drafts.map((d, i) => {
    const v = vehicles[d.vi];
    const { client, description } = cargoFor(rng, v.trailer, d.route);
    return {
      id: `VJ-${1001 + i}`,
      vehicleId: v.id,
      routeId: d.route.id,
      client,
      cargo: {
        description,
        weightTon: rint(rng, 8, 28),
        waybill: `GD-${String(rint(rng, 100000, 999999))}`,
      },
      plannedLoadStart: d.loadStart,
      plannedLoadMin: d.loadMin,
      plannedDeparture: d.departure,
      committedArrival: d.committed,
      plannedUnloadMin: d.unloadMin,
    };
  });

  const scripts: Record<string, TripScript> = {};
  for (const t of trips) {
    scripts[t.id] = { extraLoadMin: 0, bias: rfloat(rng, -0.025, 0.025), p1: rfloat(rng, 0, 6.28), p2: rfloat(rng, 0, 6.28) };
  }

  // Historia de la mañana: viajes cortos que salen entre 07:40 y 08:50 con problemas distintos.
  const shortMorning = (from: number, to: number) =>
    shuffle(
      rng,
      trips.filter((t) => {
        const r = ROUTE_BY_ID[t.routeId];
        return r.baseDurationMin >= 90 && planRoute(r).totalMin <= 140 && t.plannedDeparture >= at(from) && t.plannedDeparture <= at(to);
      }),
    );
  let cohort = shortMorning(hm(7, 40), hm(8, 50));
  if (cohort.length < 5) cohort = shortMorning(hm(7), hm(9));
  // Las historias con detención van a los viajes que salen antes: la parada ocurre antes de las 09:30.
  cohort.sort((a, b) => a.plannedDeparture - b.plannedDeparture);

  const stories: { late: number; stop: number }[] = [
    { late: 30, stop: 14 }, // retrasado
    { late: 35, stop: 10 }, // retrasado
    { late: 25, stop: 0 }, // en riesgo
    { late: 22, stop: 0 }, // en riesgo
    { late: 24, stop: 0 }, // en riesgo
  ];
  const used = new Set<string>();
  const marked = new Set<string>();
  let s = 0;
  for (const t of [...cohort.slice(0, 2), ...shuffle(rng, cohort.slice(2))]) {
    if (s >= stories.length) break;
    if (used.has(t.vehicleId)) continue;
    used.add(t.vehicleId);
    const st = stories[s++];
    const sc = scripts[t.id];
    sc.extraLoadMin = st.late;
    marked.add(t.id);
    if (st.stop) sc.stop = { km: pickStopKm(rng, ROUTE_BY_ID[t.routeId], 0.2, 0.45), durMin: st.stop };
  }

  // Resto del día: ~20 % de los viajes con carga más larga (fuera de la ventana calibrada).
  const rest = shuffle(
    rng,
    trips.filter((t) => !marked.has(t.id) && !(t.plannedLoadStart >= at(hm(6, 30)) && t.plannedLoadStart <= at(hm(9, 45)))),
  );
  const lateTarget = Math.max(0, Math.round(trips.length * 0.2) - marked.size);
  rest.slice(0, lateTarget).forEach((t) => {
    scripts[t.id].extraLoadMin = rint(rng, 10, 35);
    marked.add(t.id);
  });

  // Una detención más por la tarde (en total, un par o tres en el día).
  const afternoon = rest.filter((t) => t.plannedDeparture >= at(hm(10)) && !scripts[t.id].stop);
  if (afternoon.length) {
    const t = afternoon[0];
    scripts[t.id].stop = { km: pickStopKm(rng, ROUTE_BY_ID[t.routeId], 0.2, 0.8), durMin: rint(rng, 12, 20) };
  }

  return { scenario: { dayStart, startAt, vehicles, trips }, scripts };
}
