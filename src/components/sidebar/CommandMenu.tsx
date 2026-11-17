"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { Anchor, Bell, CarFront, FlaskConical, Mountain, Pause, Play, Route, Truck, Wrench } from "lucide-react";
import { CORRIDORS, PLACE_BY_ID, ROUTE_BY_ID } from "@/data";
import { STATE_LABEL } from "@/lib/labels";
import { useFleetRows, useFleetStore, type SidebarSection } from "@/lib/store";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { StatusDot } from "@/components/ui/status";
import { normalize, vehicleHaystack } from "./search";

/** Estado de apertura de la paleta: el botón del encabezado y el atajo lo comparten. */
const useCommandMenu = create<{ open: boolean; setOpen(open: boolean): void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export const openCommandMenu = () => useCommandMenu.getState().setOpen(true);

const SECTIONS: { key: SidebarSection; label: string; icon: typeof Route }[] = [
  { key: "trips", label: "Viajes", icon: Route },
  { key: "fleet", label: "Flota", icon: Truck },
  { key: "alerts", label: "Alertas", icon: Bell },
  { key: "simulator", label: "Simulador", icon: FlaskConical },
];

const INCIDENT_MIN = 60;

// Sin tildes ni mayúsculas, sobre el valor y las palabras clave de cada opción.
const filter = (value: string, search: string, keywords?: string[]) =>
  normalize(`${value} ${keywords?.join(" ") ?? ""}`).includes(normalize(search.trim())) ? 1 : 0;

export default function CommandMenu() {
  const open = useCommandMenu((s) => s.open);
  const setOpen = useCommandMenu((s) => s.setOpen);

  // Ctrl/Cmd + K abre y cierra la paleta desde cualquier parte.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const { open, setOpen } = useCommandMenu.getState();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Paleta de comandos"
      description="Busca un camión, ve a una sección o ejecuta una acción del simulador."
      className="sm:max-w-lg"
    >
      {/* El contenido solo existe con la paleta abierta: cerrada no se suscribe a la flota. */}
      <Palette onDone={() => setOpen(false)} />
    </CommandDialog>
  );
}

function Palette({ onDone }: { onDone: () => void }) {
  const rows = useFleetRows();
  const controls = useFleetStore((s) => s.controls);
  const running = useFleetStore((s) => s.sim.running);
  const selectedId = useFleetStore((s) => s.selectedVehicleId);
  const selectedUnit = useFleetStore((s) => (s.selectedVehicleId ? s.vehicles[s.selectedVehicleId]?.unit : undefined));

  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };

  return (
    <Command filter={filter} className="rounded-xl bg-popover">
      <CommandInput placeholder="Buscar camión, patente, conductor, ruta o acción…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Sin resultados.</CommandEmpty>

        {rows.length > 0 && (
          <CommandGroup heading="Camiones">
            {rows.map(({ vehicle, trip, state }) => {
              const route = trip ? ROUTE_BY_ID[trip.routeId] : undefined;
              return (
                <CommandItem
                  key={vehicle.id}
                  value={`camion ${vehicle.id}`}
                  keywords={[vehicleHaystack(vehicle, trip)]}
                  onSelect={run(() => useFleetStore.getState().selectVehicle(vehicle.id))}
                >
                  <StatusDot state={state} />
                  <span className="font-semibold tracking-tight">{vehicle.unit}</span>
                  <span className="font-mono text-xs text-muted-foreground">{vehicle.plate}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{route?.name ?? "Sin viaje"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{STATE_LABEL[state]}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandGroup heading="Secciones">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <CommandItem
              key={key}
              value={`ir a ${label}`}
              keywords={["seccion", "navegar"]}
              onSelect={run(() => useFleetStore.getState().setSection(key))}
            >
              <Icon />
              Ir a {label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Acciones del simulador">
          <CommandItem
            value="pausar reanudar simulacion"
            keywords={["pausa", "continuar", "tiempo"]}
            disabled={!controls}
            onSelect={run(() => controls?.setRunning(!running))}
          >
            {running ? <Pause /> : <Play />}
            {running ? "Pausar la simulación" : "Reanudar la simulación"}
          </CommandItem>
          {CORRIDORS.map((c) => (
            <CommandItem
              key={c.id}
              value={`provocar taco en ${c.name}`}
              keywords={[c.label, "congestion", "incidente"]}
              disabled={!controls}
              onSelect={run(() => controls?.injectIncident({ kind: "congestion", corridor: c.id, durationMin: INCIDENT_MIN }))}
            >
              <CarFront />
              Provocar taco en {c.name}
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </CommandItem>
          ))}
          <CommandItem
            value="provocar averia"
            keywords={["falla", "camion", "incidente"]}
            disabled={!controls}
            onSelect={run(() =>
              controls?.injectIncident({
                kind: "breakdown",
                ...(selectedId ? { vehicleId: selectedId } : {}),
                durationMin: INCIDENT_MIN,
              }),
            )}
          >
            <Wrench />
            {selectedUnit ? `Provocar avería en ${selectedUnit}` : "Provocar avería en un camión al azar"}
          </CommandItem>
          <CommandItem
            value="cerrar paso los libertadores"
            keywords={["frontera", "aduana", "incidente"]}
            disabled={!controls}
            onSelect={run(() =>
              controls?.injectIncident({ kind: "border_closure", placeId: "paso-libertadores", durationMin: INCIDENT_MIN }),
            )}
          >
            <Mountain />
            Cerrar el Paso Los Libertadores
          </CommandItem>
          {(["puerto-san-antonio", "puerto-valparaiso"] as const).map((id) => (
            <CommandItem
              key={id}
              value={`provocar espera en puerto ${PLACE_BY_ID[id]?.shortName ?? id}`}
              keywords={["fila", "incidente"]}
              disabled={!controls}
              onSelect={run(() => controls?.injectIncident({ kind: "port_delay", placeId: id, durationMin: INCIDENT_MIN }))}
            >
              <Anchor />
              Provocar espera en puerto {PLACE_BY_ID[id]?.shortName ?? id}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
