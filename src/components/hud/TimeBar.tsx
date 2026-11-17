"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClock } from "@/lib/labels";
import { LAYOUT, TIME_SCALES, useFleetStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" });

function formatDate(ts: number): string {
  const s = dateFmt.format(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Velocidades que se ocultan primero cuando el espacio libre es poco.
const SECONDARY_SCALES: readonly number[] = [10, 60];

/**
 * Reloj de la simulación, flotando abajo al centro del mapa. Se corre a la izquierda si hay
 * detalle abierto y se compacta según el espacio que quede (consultas de contenedor): primero
 * pierde la fecha, luego dos velocidades y por último la etiqueta. En móvil se oculta con el detalle.
 */
export default function TimeBar() {
  const ready = useFleetStore((s) => s.ready);
  const now = useFleetStore((s) => s.now);
  const sim = useFleetStore((s) => s.sim);
  const controls = useFleetStore((s) => s.controls);
  const hasSelection = useFleetStore((s) => s.selectedVehicleId !== null);

  const disabled = !ready || !controls;

  return (
    <div
      className={cn(
        "@container pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 transition-[padding] duration-300 ease-(--ease-out-expo)",
        hasSelection && "max-md:hidden",
      )}
      // Con detalle abierto el espacio libre es el mapa menos ese panel (solo en pantallas anchas).
      style={{ paddingRight: hasSelection ? LAYOUT.detailW + LAYOUT.gap * 2 : undefined }}
    >
      <div className="glass pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl py-2 pr-2.5 pl-4 @max-[480px]:gap-2 @max-[480px]:pl-3">
        <div className="flex min-w-0 flex-col">
          <span className="eyebrow flex items-center gap-1.5 @max-[330px]:hidden">
            <span className={`size-1.5 rounded-full ${sim.running ? "bg-ok" : "bg-muted-foreground/50"}`} />
            Simulación
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-7 font-semibold tracking-tight tabular @max-[330px]:text-xl">
              {ready ? formatClock(now) : "--:--"}
            </span>
            <span className="truncate text-xs text-muted-foreground @max-[540px]:hidden">{ready ? formatDate(now) : ""}</span>
          </div>
        </div>

        <div className="h-8 w-px shrink-0 bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-lg"
              className="shrink-0"
              disabled={disabled}
              onClick={() => controls?.setRunning(!sim.running)}
              aria-label={sim.running ? "Pausar simulación" : "Reanudar simulación"}
            >
              {sim.running ? <Pause /> : <Play />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{sim.running ? "Pausar" : "Reanudar"}</TooltipContent>
        </Tooltip>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          disabled={disabled}
          value={String(sim.timeScale)}
          onValueChange={(v) => v && controls?.setTimeScale(Number(v))}
          aria-label="Velocidad de la simulación"
        >
          {TIME_SCALES.map((s) => (
            <ToggleGroupItem
              key={s}
              value={String(s)}
              aria-label={`Velocidad por ${s}`}
              // La velocidad activa nunca se oculta, aunque sea de las secundarias.
              className={cn("tabular", SECONDARY_SCALES.includes(s) && s !== sim.timeScale && "@max-[420px]:hidden")}
            >
              ×{s}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
