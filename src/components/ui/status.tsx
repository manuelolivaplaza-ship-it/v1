import { STATE_CLASS, STATE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DisplayState } from "@/lib/types";

/** Punto de color de estado. Con `pulse`, late para llamar la atención (retrasado, detenido). */
export function StatusDot({ state, pulse = false, className }: { state: DisplayState; pulse?: boolean; className?: string }) {
  const c = STATE_CLASS[state];
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)}>
      {pulse && (
        <span
          className={cn("absolute inset-0 rounded-full", c.dot)}
          style={{ animation: "pulse-ring 1.8s var(--ease-out-expo) infinite" }}
        />
      )}
      <span className={cn("relative size-2 rounded-full", c.dot)} />
    </span>
  );
}

/** Píldora de estado: "● Retrasado". `children` reemplaza la etiqueta (p. ej. "+38 min"). */
export function StatusPill({
  state,
  children,
  className,
}: {
  state: DisplayState;
  children?: React.ReactNode;
  className?: string;
}) {
  const c = STATE_CLASS[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular",
        c.soft,
        c.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {children ?? STATE_LABEL[state]}
    </span>
  );
}
