"use client";

import { memo, useEffect } from "react";
import { BellOff } from "lucide-react";
import { SEVERITY_CLASS, formatClock } from "@/lib/labels";
import { useFleetStore } from "@/lib/store";
import type { Alert } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SectionFrame, SkeletonRows, rowClass } from "./shared";

// Más de esto no aporta en un panel lateral y encarece el pintado.
const MAX_VISIBLE = 120;

const SEVERITY_LABEL = { info: "Informativa", warning: "Advertencia", critical: "Crítica" } as const;

export default function AlertsSection() {
  const ready = useFleetStore((s) => s.ready);
  const alerts = useFleetStore((s) => s.alerts);
  const unread = useFleetStore((s) => s.unreadAlerts);

  // Mientras la sección está a la vista, lo que llega cuenta como leído.
  useEffect(() => {
    if (unread > 0) useFleetStore.getState().markAlertsRead();
  }, [unread]);

  const critical = alerts.reduce((n, a) => n + (a.severity === "critical" ? 1 : 0), 0);
  const summary = !ready
    ? "Cargando…"
    : alerts.length === 0
      ? "Sin alertas"
      : `${alerts.length} alertas · ${critical} críticas`;

  return (
    <SectionFrame title="Alertas" summary={summary}>
      {!ready ? (
        <SkeletonRows count={6} />
      ) : alerts.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellOff />
            </EmptyMedia>
            <EmptyTitle>Todo en orden</EmptyTitle>
            <EmptyDescription>
              Cuando un viaje entre en riesgo, se retrase o un camión se detenga, el aviso aparecerá aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {alerts.slice(0, MAX_VISIBLE).map((a) => (
            <AlertItem key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </SectionFrame>
  );
}

const AlertItem = memo(function AlertItem({ alert }: { alert: Alert }) {
  const sev = SEVERITY_CLASS[alert.severity];
  const enter = () => useFleetStore.getState().setHovered(alert.vehicleId);
  const leave = () => useFleetStore.getState().setHovered(null);
  return (
    <li>
      <button
        type="button"
        onClick={() => useFleetStore.getState().selectVehicle(alert.vehicleId)}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        className={cn(rowClass(false, false), "px-3 py-2")}
      >
        <div className="flex items-start gap-2">
          <span className={cn("mt-[5px] size-2 shrink-0 rounded-full", sev.dot)} aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium">{alert.title}</p>
          <span className="shrink-0 pt-px text-[11px] text-muted-foreground tabular">{formatClock(alert.ts)}</span>
        </div>
        <p className="mt-1 pl-4 text-xs leading-snug text-muted-foreground">{alert.detail}</p>
        <Badge variant="secondary" className={cn("mt-2 ml-4 h-[18px] px-1.5 text-[11px]", sev.soft, sev.text)}>
          {SEVERITY_LABEL[alert.severity]}
        </Badge>
      </button>
    </li>
  );
});
