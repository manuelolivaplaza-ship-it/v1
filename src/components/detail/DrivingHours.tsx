"use client";

import { memo } from "react";
import { formatDuration } from "@/lib/labels";
import { RULES } from "@/lib/planning";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { TripProgress } from "@/lib/types";
import { BAR, BAR_NEUTRAL, Block } from "./parts";

/** Conducción continua frente al máximo legal antes del descanso obligatorio. */
export const DrivingHours = memo(function DrivingHours({ progress: p }: { progress: TripProgress }) {
  // Solo tiene sentido con el viaje en curso.
  if (p.status === "scheduled" || p.status === "completed") return null;

  const max = RULES.maxContinuousDrivingMin;
  const pct = Math.min(100, Math.max(0, (p.continuousDrivingMin / max) * 100));
  const resting = p.activity === "resting";
  const warn = !resting && p.restDueInMin <= RULES.restWarningMin;

  let message: string;
  if (resting) message = "En descanso obligatorio";
  else if (p.restDueInMin <= 0) message = "Descanso obligatorio ahora";
  else message = `Descanso obligatorio en ${formatDuration(p.restDueInMin)}`;

  return (
    <Block title="Horas de conducción" aside={`${formatDuration(p.continuousDrivingMin)} de ${formatDuration(max)}`}>
      <div className="relative">
        <Progress
          value={pct}
          aria-label="Conducción continua"
          className={cn("h-1.5", warn ? BAR.at_risk : BAR_NEUTRAL)}
        />
        {/* Umbral de aviso */}
        <span
          aria-hidden
          className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/40"
          style={{ left: `${((max - RULES.restWarningMin) / max) * 100}%` }}
        />
      </div>
      <p className={cn("mt-2 text-[13px] font-medium", warn ? "text-warn-ink" : "text-muted-foreground")}>{message}</p>
    </Block>
  );
});
