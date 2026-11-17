"use client";

import { memo, useMemo } from "react";
import { ACTIVITY_LABEL, TRAILER_LABEL } from "@/lib/labels";
import { useFleetRows, useFleetStore } from "@/lib/store";
import type { Activity, DisplayState, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status";
import { SectionFrame, SkeletonRows, rowClass, useRowInteraction } from "./shared";

type GroupKey = "route" | "base" | "halted";

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: "route", title: "En ruta" },
  { key: "base", title: "En base o en faena" },
  { key: "halted", title: "Detenidos o sin señal" },
];

function groupOf(activity: Activity | null): GroupKey {
  if (activity === "stopped" || activity === "offline") return "halted";
  if (activity === "driving" || activity === "resting" || activity === "border_wait") return "route";
  return "base";
}

export default function FleetSection() {
  const ready = useFleetStore((s) => s.ready);
  const rows = useFleetRows();

  const grouped = useMemo(() => {
    const out: Record<GroupKey, typeof rows> = { route: [], base: [], halted: [] };
    for (const r of rows) out[groupOf(r.progress?.activity ?? null)].push(r);
    return out;
  }, [rows]);

  const summary = !ready ? "Cargando…" : `${rows.length} camiones`;

  return (
    <SectionFrame title="Flota" summary={summary}>
      {!ready ? (
        <SkeletonRows count={9} />
      ) : (
        <div className="pb-1">
          {GROUPS.map((g) =>
            grouped[g.key].length === 0 ? null : (
              <section key={g.key} aria-label={g.title}>
                <h3 className="eyebrow sticky top-0 z-10 flex items-center justify-between bg-sidebar px-2 pt-2.5 pb-1">
                  {g.title}
                  <span className="tabular">{grouped[g.key].length}</span>
                </h3>
                <ul className="space-y-1.5">
                  {grouped[g.key].map((r) => (
                    <FleetRowItem
                      key={r.vehicle.id}
                      vehicle={r.vehicle}
                      state={r.state}
                      activity={r.progress?.activity ?? null}
                    />
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </SectionFrame>
  );
}

const FleetRowItem = memo(function FleetRowItem({
  vehicle,
  state,
  activity,
}: {
  vehicle: Vehicle;
  state: DisplayState;
  activity: Activity | null;
}) {
  const { ref, selected, hovered, onSelect, onEnter, onLeave } = useRowInteraction(vehicle.id);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        aria-pressed={selected}
        className={cn(rowClass(selected, hovered), "px-3 py-2")}
      >
        <div className="flex items-center gap-2">
          <StatusDot state={state} pulse={state === "stopped"} />
          <span className="text-[13px] font-semibold tracking-tight">{vehicle.unit}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{vehicle.plate}</span>
          <Badge variant="secondary" className="ml-auto h-[18px] px-1.5 text-[11px] font-normal text-muted-foreground">
            {TRAILER_LABEL[vehicle.trailer]}
          </Badge>
        </div>
        <p className="mt-1 truncate pl-4 text-[13px] leading-tight">{vehicle.driver.name}</p>
        <p className="mt-0.5 truncate pl-4 text-xs text-muted-foreground">
          {vehicle.model}
          {activity && ` · ${ACTIVITY_LABEL[activity]}`}
        </p>
      </button>
    </li>
  );
});
