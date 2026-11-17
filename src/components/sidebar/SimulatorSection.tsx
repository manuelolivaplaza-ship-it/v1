"use client";

import { memo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Anchor, CarFront, Mountain, RotateCcw, Wrench, X, type LucideIcon } from "lucide-react";
import { CORRIDORS, PLACE_BY_ID } from "@/data";
import { formatDuration } from "@/lib/labels";
import { useFleetStore } from "@/lib/store";
import type { CorridorId, Incident, IncidentKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SectionFrame } from "./shared";

const DURATIONS = [30, 60, 120] as const;
const PORTS = ["puerto-san-antonio", "puerto-valparaiso"] as const;

const KIND_ICON: Record<IncidentKind, LucideIcon> = {
  congestion: CarFront,
  breakdown: Wrench,
  border_closure: Mountain,
  port_delay: Anchor,
};

export default function SimulatorSection() {
  const controls = useFleetStore((s) => s.controls);
  const incidents = useFleetStore((s) => s.incidents);
  const selectedId = useFleetStore((s) => s.selectedVehicleId);
  const selectedUnit = useFleetStore((s) => (s.selectedVehicleId ? s.vehicles[s.selectedVehicleId]?.unit : undefined));

  const [duration, setDuration] = useState<number>(60);
  const [corridor, setCorridor] = useState<CorridorId>(CORRIDORS[0]?.id ?? "ruta-68");
  const [port, setPort] = useState<string>(PORTS[0]);

  const off = !controls;

  return (
    <SectionFrame
      title="Simulador"
      summary={
        off
          ? "Preparando…"
          : `${incidents.length} ${incidents.length === 1 ? "incidente activo" : "incidentes activos"}`
      }
    >
      <div className="space-y-5 pt-1 pb-3">
        <section aria-labelledby="sim-provoke" className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h3 id="sim-provoke" className="eyebrow">
              Provocar un incidente
            </h3>
            <Segmented
              label="Duración del incidente"
              value={String(duration)}
              onChange={(v) => setDuration(Number(v))}
              options={DURATIONS.map((d) => ({ value: String(d), label: formatDuration(d) }))}
            />
          </div>

          <ActionCard
            icon={CarFront}
            title="Taco en ruta"
            desc="Baja la velocidad de los camiones que cruzan el corredor."
            action="Provocar taco"
            disabled={off}
            onAction={() => controls?.injectIncident({ kind: "congestion", corridor, durationMin: duration })}
          >
            <Select value={corridor} onValueChange={(v) => setCorridor(v as CorridorId)}>
              <SelectTrigger size="sm" className="w-full bg-card text-[13px]" aria-label="Corredor">
                <SelectValue placeholder="Corredor" />
              </SelectTrigger>
              <SelectContent position="popper">
                {CORRIDORS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ActionCard>

          <ActionCard
            icon={Wrench}
            title="Avería"
            desc={
              selectedUnit
                ? `Afectará al camión seleccionado: ${selectedUnit}.`
                : "Sin camión seleccionado: se elegirá uno al azar entre los que van en ruta."
            }
            action={selectedUnit ? `Averiar ${selectedUnit}` : "Provocar avería"}
            disabled={off}
            onAction={() =>
              controls?.injectIncident({
                kind: "breakdown",
                ...(selectedId ? { vehicleId: selectedId } : {}),
                durationMin: duration,
              })
            }
          />

          <ActionCard
            icon={Mountain}
            title="Cerrar Paso Los Libertadores"
            desc="Los camiones hacia Mendoza esperan en aduana hasta que se reabra."
            action="Cerrar el paso"
            disabled={off}
            onAction={() =>
              controls?.injectIncident({ kind: "border_closure", placeId: "paso-libertadores", durationMin: duration })
            }
          />

          <ActionCard
            icon={Anchor}
            title="Espera en puerto"
            desc="Los camiones que entran al puerto elegido quedan en fila de acceso."
            action="Provocar espera"
            disabled={off}
            onAction={() => controls?.injectIncident({ kind: "port_delay", placeId: port, durationMin: duration })}
          >
            <Segmented
              label="Puerto"
              fill
              value={port}
              onChange={setPort}
              options={PORTS.map((p) => ({ value: p, label: PLACE_BY_ID[p]?.shortName ?? p }))}
            />
          </ActionCard>
        </section>

        <section aria-labelledby="sim-active" className="space-y-2">
          <h3 id="sim-active" className="eyebrow px-0.5">
            Incidentes activos
          </h3>
          {incidents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Ninguno por ahora. Provoca uno arriba y mira cómo reacciona la flota.
            </p>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {incidents.map((inc) => (
                  <ActiveIncident key={inc.id} incident={inc} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        <section aria-labelledby="sim-reset" className="space-y-2">
          <h3 id="sim-reset" className="eyebrow px-0.5">
            Día simulado
          </h3>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={off} className="w-full bg-card text-[13px]">
                <RotateCcw />
                Reiniciar el día
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Reiniciar el día simulado?</AlertDialogTitle>
                <AlertDialogDescription>
                  Los camiones vuelven a la hora de partida y se borran los incidentes y las alertas del día.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => controls?.reset()}>
                  Reiniciar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>
    </SectionFrame>
  );
}

/** Selector segmentado de una sola opción (duración, puerto). */
function Segmented({
  label,
  value,
  onChange,
  options,
  fill = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  fill?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      // Radix entrega "" al volver a pulsar la opción activa: se ignora para no quedar sin selección.
      onValueChange={(v) => v && onChange(v)}
      spacing={0.5}
      className={cn("rounded-lg bg-muted p-0.5", fill && "w-full")}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            "h-6 rounded-md px-2.5 text-xs tabular data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-card data-[state=on]:hover:bg-card",
            fill && "flex-1",
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ActionCard({
  icon: Icon,
  title,
  desc,
  action,
  disabled,
  onAction,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  action: string;
  disabled: boolean;
  onAction: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-foreground">
          <Icon className="size-4" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children && <div className="mt-2.5">{children}</div>}
      <Button variant="outline" size="sm" disabled={disabled} onClick={onAction} className="mt-3 w-full">
        {action}
      </Button>
    </div>
  );
}

const ActiveIncident = memo(function ActiveIncident({ incident }: { incident: Incident }) {
  // Solo el minuto restante cambia el selector, así la fila no se pinta en cada tick.
  const minLeft = useFleetStore((s) => Math.max(0, Math.ceil((incident.endsAt - s.now) / 60_000)));
  const Icon = KIND_ICON[incident.kind];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 rounded-lg border border-warn/30 bg-warn-soft py-2 pr-2 pl-3"
    >
      <Icon className="size-4 shrink-0 text-warn-ink" strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{incident.label}</p>
        <p className="text-[11px] text-muted-foreground tabular">Termina en {formatDuration(minLeft)}</p>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="bg-card"
        onClick={() => useFleetStore.getState().controls?.clearIncident(incident.id)}
        aria-label={`Terminar incidente: ${incident.label}`}
      >
        <X />
        Terminar
      </Button>
    </motion.li>
  );
});
