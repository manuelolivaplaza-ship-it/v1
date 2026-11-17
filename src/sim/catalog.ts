import type { RouteDef, TrailerType } from "@/lib/types";
import { pick, type Rng } from "./rng";

/** Datos de ficción para armar la flota y la carga. */

export const TRUCK_MODELS = [
  "Volvo FH 460",
  "Scania R 450",
  "Mercedes-Benz Actros 2645",
  "Freightliner Cascadia",
  "Kenworth T680",
  "International LT",
] as const;

export const FIRST_NAMES = [
  "Juan", "Luis", "Carlos", "Jorge", "Pedro", "Marcelo", "Cristián", "Rodrigo", "Patricio", "Hernán",
  "Claudio", "Fabián", "Mauricio", "Sergio", "Gonzalo", "Héctor", "Óscar", "Raúl", "Víctor", "Eduardo",
  "Felipe", "Ricardo", "Álvaro", "Iván", "Manuel", "Miguel", "Alejandro", "Nelson", "Julio", "Waldo",
];

export const LAST_NAMES = [
  "González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda",
  "Morales", "Rodríguez", "López", "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza", "Valenzuela",
  "Castillo", "Tapia", "Reyes", "Gutiérrez", "Castro", "Pizarro", "Álvarez", "Vásquez", "Sánchez", "Carrasco",
  "Cortés", "Herrera", "Núñez", "Jara", "Vergara", "Rivera", "Figueroa", "Riquelme", "Miranda", "Bravo",
  "Vera", "Molina", "Campos", "Sandoval", "Orellana", "Cárdenas", "Olivares", "Alarcón", "Gallardo", "Garrido",
];

/** Letras válidas en patentes chilenas (sin vocales ni M, N, Ñ, Q). */
export const PLATE_LETTERS = "BCDFGHJKLPRSTVWXYZ";

/** Cantidad de camiones de cada tipo de remolque (suma 30). */
export const TRAILER_POOL: TrailerType[] = [
  ...Array<TrailerType>(10).fill("container"),
  ...Array<TrailerType>(8).fill("reefer"),
  ...Array<TrailerType>(6).fill("dry_van"),
  ...Array<TrailerType>(3).fill("flatbed"),
  ...Array<TrailerType>(3).fill("tanker"),
];

// ───────────────────────── Compatibilidad remolque/ruta ─────────────────────────

const isPort = (id: string) => id.startsWith("puerto-");

export interface RouteTraits {
  toPort: boolean;
  fromPort: boolean;
  /** Región distinta de la costa: "mendoza" | "la-serena" | "talca" | "rancagua" | "los-andes" | null */
  region: string | null;
}

export function routeTraits(route: RouteDef): RouteTraits {
  const ends = [route.originId, route.destinationId];
  const region = ["mendoza", "la-serena", "talca", "rancagua", "los-andes"].find((r) => ends.includes(r)) ?? null;
  return { toPort: isPort(route.destinationId), fromPort: isPort(route.originId), region };
}

export function trailerFits(trailer: TrailerType, route: RouteDef): boolean {
  const t = routeTraits(route);
  const port = t.toPort || t.fromPort;
  switch (trailer) {
    case "container":
      return port;
    case "reefer":
      return port || ["talca", "rancagua", "la-serena", "mendoza"].includes(t.region ?? "");
    case "flatbed":
      return t.fromPort || t.region !== null;
    case "tanker":
      return port || ["rancagua", "talca", "la-serena"].includes(t.region ?? "");
    default:
      return true;
  }
}

// ───────────────────────── Carga y clientes ─────────────────────────

interface Category {
  items: string[];
  clients: string[];
}

const CLIENTS = {
  fruta: ["Frutícola Santa Elvira", "Exportadora Valle Claro", "Agroexport Los Aromos", "Comercializadora Frutas del Sur", "Agrícola Río Teno"],
  vino: ["Viñedos Cuatro Cumbres", "Vinos Pirque Alto", "Agroindustrial Peumo Viejo", "Viña Terrazas del Maipo"],
  retail: ["Distribuidora Andes Norte", "Comercial Ñuble Hermanos", "Importadora Cordillera", "Hogar Mayor Chile", "Mayorista Plaza Vespucio Sur"],
  importacion: ["Importadora Pacífico Austral", "Comercial Asia-Chile", "Tecnomundo Importaciones", "Neumáticos Cordillera"],
  exportacion: ["Exportadora Costa Nueva", "Celulosa y Papeles del Biobío Sur", "Comercial Maule Export", "Alimentos Andinos de Exportación"],
  minero: ["Servicios Mineros Altiplano", "Contratistas Cerro Pintado", "Equipos y Montajes Elqui", "Suministros Industriales del Norte"],
  industrial: ["Aceros del Pacífico Sur", "Maderas y Aserraderos del Maule", "Constructora Los Robles", "Ferretería Industrial Rancagüina", "Metalúrgica Santa Clara"],
  graneles: ["Química Nueva Aconcagua", "Agroindustrial Valle Central", "Combustibles Ruta Sur", "Lácteos Colliguay"],
  frio: ["Frigorífico Los Cóndores", "Alimentos del Cachapoal", "Lácteos Las Araucarias", "Distribuidora FríoSur"],
};

const CARGO: Record<string, Category> = {
  contExport: {
    items: ["Contenedor 40' de vino embotellado", "Contenedor 40' de celulosa en fardos", "Contenedor 20' de fruta deshidratada", "Contenedor 40' de alimentos envasados"],
    clients: [...CLIENTS.exportacion, ...CLIENTS.vino],
  },
  contImport: {
    items: ["Contenedor 40' de electrodomésticos", "Contenedor 20' de repuestos automotrices", "Contenedor 40' de textiles y calzado", "Contenedor 40' de neumáticos", "Contenedor 40' de artículos electrónicos"],
    clients: CLIENTS.importacion,
  },
  frutaExport: {
    items: ["Cerezas de exportación en pallets", "Uva de mesa embalada", "Paltas Hass en cajas", "Arándanos frescos", "Carozos embalados (duraznos y ciruelas)"],
    clients: CLIENTS.fruta,
  },
  frioImport: {
    items: ["Lácteos refrigerados importados", "Carnes congeladas importadas", "Productos del mar congelados"],
    clients: CLIENTS.frio,
  },
  frutaInterior: {
    items: ["Fruta fresca embalada", "Kiwis y manzanas en cajas", "Hortalizas refrigeradas"],
    clients: CLIENTS.fruta,
  },
  frioDistrib: {
    items: ["Lácteos y yogures para distribución", "Congelados para supermercados", "Quesos y fiambres refrigerados"],
    clients: CLIENTS.frio,
  },
  seco: {
    items: ["Abarrotes y bebidas", "Electrodomésticos", "Textiles y calzado", "Artículos de ferretería", "Cartón corrugado para embalaje", "Productos de aseo y limpieza"],
    clients: CLIENTS.retail,
  },
  planoMinero: {
    items: ["Equipos y repuestos para minería", "Estructuras metálicas", "Tuberías de acero para faena"],
    clients: CLIENTS.minero,
  },
  planoIndustrial: {
    items: ["Vigas de acero estructural", "Bobinas de acero", "Madera aserrada", "Maquinaria agrícola", "Tubería de PVC"],
    clients: CLIENTS.industrial,
  },
  granelVino: { items: ["Vino a granel", "Aceite vegetal a granel"], clients: [...CLIENTS.vino, ...CLIENTS.graneles] },
  granelQuimico: { items: ["Ácido sulfúrico", "Metanol", "Diésel"], clients: [...CLIENTS.minero, ...CLIENTS.graneles] },
};

/** Descripción de carga y cliente coherentes con el remolque y el sentido de la ruta. */
export function cargoFor(rng: Rng, trailer: TrailerType, route: RouteDef): { client: string; description: string } {
  const t = routeTraits(route);
  const port = t.toPort || t.fromPort;
  let cat: Category;
  switch (trailer) {
    case "container":
      cat = t.toPort ? CARGO.contExport : CARGO.contImport;
      break;
    case "reefer":
      if (t.toPort) cat = CARGO.frutaExport;
      else if (t.fromPort) cat = CARGO.frioImport;
      else cat = route.destinationId.startsWith("cd-") ? CARGO.frutaInterior : CARGO.frioDistrib;
      break;
    case "flatbed":
      cat = t.region === "mendoza" || t.region === "la-serena" ? CARGO.planoMinero : CARGO.planoIndustrial;
      break;
    case "tanker":
      cat = t.region === "la-serena" ? CARGO.granelQuimico : port || t.region === "talca" ? CARGO.granelVino : CARGO.granelQuimico;
      break;
    default:
      cat = CARGO.seco;
  }
  return { client: pick(rng, cat.clients), description: pick(rng, cat.items) };
}
