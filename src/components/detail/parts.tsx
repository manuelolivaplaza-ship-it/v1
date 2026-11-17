"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DisplayState, TripProgress } from "@/lib/types";

/** Curva de entrada estándar (--ease-out-expo). */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Bloque de una pestaña: encabezado pequeño y contenido; los bloques se separan con línea fina. */
export function Block({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-4 first:pt-0 last:pb-0", className)}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="eyebrow">{title}</h3>
        {aside ? <div className="text-xs text-muted-foreground tabular">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Contenido de una pestaña: aparece con un fundido corto y separa sus bloques con línea. */
export function Pane({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="divide-y divide-border px-4 py-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Lista de pares etiqueta / valor. */
export function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-[13px]">{children}</dl>;
}

export function Field({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium tabular" title={title}>
        {children}
      </dd>
    </>
  );
}

/**
 * Color del indicador de `Progress` (shadcn lo fija en bg-primary).
 * Las clases están completas para que Tailwind las detecte.
 */
export const BAR: Record<DisplayState, string> = {
  on_time: "[&>[data-slot=progress-indicator]]:bg-ok",
  at_risk: "[&>[data-slot=progress-indicator]]:bg-warn",
  delayed: "[&>[data-slot=progress-indicator]]:bg-late",
  stopped: "[&>[data-slot=progress-indicator]]:bg-halt",
  offline: "[&>[data-slot=progress-indicator]]:bg-muted-foreground/60",
  scheduled: "[&>[data-slot=progress-indicator]]:bg-sched",
  completed: "[&>[data-slot=progress-indicator]]:bg-muted-foreground/60",
  idle: "[&>[data-slot=progress-indicator]]:bg-muted-foreground/60",
};
export const BAR_NEUTRAL = "[&>[data-slot=progress-indicator]]:bg-foreground/70";

/** Color del desvío: el del estado del viaje cuando está en curso; si no, el estado visual. */
export function toneOf(p: TripProgress | null, state: DisplayState): DisplayState {
  if (!p) return state;
  if (p.status === "on_time" || p.status === "at_risk" || p.status === "delayed") return p.status;
  return state;
}

/** Texto que se desliza al cambiar de valor (ETA, desvío). */
export function Swap({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
