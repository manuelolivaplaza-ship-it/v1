"use client";

import { memo, useMemo } from "react";
import { SEVERITY_CLASS, formatClock } from "@/lib/labels";
import { useFleetStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Block } from "./parts";

/** Las 3 alertas más recientes de este camión. */
export const VehicleAlerts = memo(function VehicleAlerts({ vehicleId }: { vehicleId: string }) {
  const alerts = useFleetStore((s) => s.alerts);
  const mine = useMemo(() => alerts.filter((a) => a.vehicleId === vehicleId).slice(0, 3), [alerts, vehicleId]);

  return (
    <Block title="Alertas recientes">
      {mine.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Sin alertas recientes.</p>
      ) : (
        <ul className="space-y-3">
          {mine.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", SEVERITY_CLASS[a.severity].dot)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{formatClock(a.ts)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{a.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
});
