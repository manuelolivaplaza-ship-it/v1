"use client";

import { useCallback, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFleetStore } from "@/lib/store";

/**
 * Interacción común de las filas (clic, cursor, resaltado). Cada fila se suscribe solo a si
 * ella está seleccionada o con el cursor encima, para que la lista no se re-renderice.
 */
export function useRowInteraction(vehicleId: string) {
  const selected = useFleetStore((s) => s.selectedVehicleId === vehicleId);
  const hovered = useFleetStore((s) => s.hoveredVehicleId === vehicleId);
  const onSelect = useCallback(() => useFleetStore.getState().selectVehicle(vehicleId), [vehicleId]);
  const onEnter = useCallback(() => useFleetStore.getState().setHovered(vehicleId), [vehicleId]);
  const onLeave = useCallback(() => useFleetStore.getState().setHovered(null), []);
  const ref = useRef<HTMLButtonElement>(null);

  // Si el camión se elige desde el mapa, la fila se muestra sin mover la lista de más.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return { ref, selected, hovered, onSelect, onEnter, onLeave };
}

/** Tarjeta blanca con borde fino; resalta si está seleccionada o con el cursor desde el mapa. */
export function rowClass(selected: boolean, hovered: boolean): string {
  return cn(
    "block w-full rounded-lg border text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    selected
      ? "border-foreground/40 bg-accent"
      : hovered
        ? "border-foreground/25 bg-muted"
        : "border-border bg-card hover:border-foreground/25 hover:bg-muted/50",
  );
}

/** Encabezado de una sección: título a la izquierda y resumen discreto a la derecha. */
export function SectionHeader({ title, summary }: { title: string; summary: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="truncate text-xs text-muted-foreground tabular">{summary}</p>
    </div>
  );
}

/** Marco de una sección: cabecera fija arriba y lista con desplazamiento propio. */
export function SectionFrame({
  title,
  summary,
  toolbar,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 px-4 pt-1.5 pb-2">
        <SectionHeader title={title} summary={summary} />
        {toolbar}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">{children}</div>
    </section>
  );
}

/** Esqueletos de carga mientras el simulador se precalienta. */
export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
          <Skeleton className="mt-2.5 ml-4 h-3 w-2/3" />
          <Skeleton className="mt-2.5 ml-4 h-1 w-[calc(100%-1rem)] rounded-full" />
        </div>
      ))}
    </div>
  );
}
