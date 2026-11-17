"use client";

import { ArrowRight } from "lucide-react";
import { memo } from "react";
import { PLACE_BY_ID, ROUTE_BY_ID } from "@/data";
import { ACTIVITY_LABEL, STATE_CLASS, formatKm } from "@/lib/labels";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DisplayState, Trip, TripProgress } from "@/lib/types";
import { BAR, Block, toneOf } from "./parts";

/** Origen → destino, barra de avance y actividad actual. */
export const RouteSection = memo(function RouteSection({
  trip,
  progress: p,
  state,
}: {
  trip: Trip;
  progress: TripProgress;
  state: DisplayState;
}) {
  const route = ROUTE_BY_ID[trip.routeId];
  if (!route) return null;
  const origin = PLACE_BY_ID[route.originId];
  const dest = PLACE_BY_ID[route.destinationId];
  const pct = Math.round(Math.min(1, Math.max(0, p.progressPct)) * 100);

  return (
    <Block title="Ruta" aside={`${pct} %`}>
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className="min-w-0 truncate">{origin?.shortName ?? route.originId}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate">{dest?.shortName ?? route.destinationId}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{route.name}</div>

      <div className="relative mt-3.5">
        <Progress value={pct} aria-label="Avance del viaje" className={cn("h-1.5", BAR[toneOf(p, state)])} />
        {route.checkpoints.map((c) => (
          <span
            key={c.placeId}
            title={PLACE_BY_ID[c.placeId]?.name ?? c.placeId}
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-muted-foreground/70"
            style={{ left: `${(c.km / route.distanceKm) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground tabular">
        <span>
          <span className="font-medium text-foreground">{formatKm(p.progressKm)}</span> recorridos
        </span>
        <span>
          faltan <span className="font-medium text-foreground">{formatKm(p.remainingKm)}</span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-muted px-2.5 py-2 text-[13px]">
        <span className="text-muted-foreground">Actividad actual</span>
        <span className="flex items-center gap-2 font-medium">
          <span className={cn("size-1.5 rounded-full", STATE_CLASS[state].dot)} />
          {ACTIVITY_LABEL[p.activity]}
        </span>
      </div>
    </Block>
  );
});
