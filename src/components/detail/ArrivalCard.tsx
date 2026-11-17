"use client";

import { memo } from "react";
import { STATE_CLASS, formatClock, formatDelay, formatDuration } from "@/lib/labels";
import { RULES } from "@/lib/planning";
import { cn } from "@/lib/utils";
import type { DisplayState, Trip, TripProgress } from "@/lib/types";
import { Swap, toneOf } from "./parts";

/** Bloque principal: cuándo llega, cuánto se desvía y qué tan lejos está del compromiso. */
export const ArrivalCard = memo(function ArrivalCard({
  trip,
  progress: p,
  state,
}: {
  trip: Trip;
  progress: TripProgress;
  state: DisplayState;
}) {
  const tol = RULES.toleranceMin;
  const delay = Math.round(p.delayMin);
  const late = delay >= tol;
  const early = delay <= -tol;

  let label = "Llegada estimada";
  let tone: DisplayState = toneOf(p, state);
  let delayText: string | null = formatDelay(p.delayMin);
  let note: string;
  const big = formatClock(p.status === "completed" ? (p.actualArrival ?? p.eta) : p.eta);

  if (p.status === "completed") {
    label = "Llegada real";
    tone = late ? "delayed" : "on_time";
    const at = formatClock(p.actualArrival ?? p.eta);
    note = late
      ? `Llegó a las ${at}, ${formatDuration(delay)} tarde`
      : early
        ? `Llegó a las ${at}, ${formatDuration(-delay)} antes`
        : `Llegó a las ${at}, a tiempo`;
  } else if (p.status === "scheduled") {
    tone = "scheduled";
    delayText = late ? formatDelay(p.delayMin) : null;
    note = `Sale a las ${formatClock(trip.plannedDeparture)}`;
  } else if (p.status === "delayed") {
    note = `Llegará ${formatDuration(delay)} tarde`;
  } else if (p.status === "at_risk") {
    note = `Llegaría ${formatDuration(delay)} tarde`;
  } else {
    note = early ? `${formatDuration(-delay)} antes de lo comprometido` : "Llegará dentro del plazo";
  }

  const c = STATE_CLASS[tone];
  return (
    <div className={cn("rounded-xl border border-foreground/5 p-3.5", c.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{label}</div>
          <Swap value={big} className="mt-1 text-4xl leading-none font-semibold tracking-tight tabular" />
        </div>
        {delayText && (
          <div className={cn("shrink-0 text-right", c.text)}>
            <div className="eyebrow !text-current/70">Desvío</div>
            <Swap
              value={delayText}
              className={cn(delayText.length > 7 ? "text-xl" : "text-2xl", "mt-1 leading-none font-semibold tabular")}
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-foreground/10 pt-2.5 text-xs">
        <span className="shrink-0 text-muted-foreground">
          Comprometido <span className="font-medium text-foreground tabular">{formatClock(trip.committedArrival)}</span>
        </span>
        <span className={cn("min-w-0 truncate text-right font-medium", c.text)}>{note}</span>
      </div>
    </div>
  );
});
