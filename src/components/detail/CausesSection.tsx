"use client";

import { Hourglass, Landmark, OctagonX, Timer, TrafficCone, Truck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { CAUSE_LABEL, STATE_CLASS, formatDuration } from "@/lib/labels";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DelayCause, DisplayState, TripProgress } from "@/lib/types";
import { BAR, Block, toneOf } from "./parts";

const CAUSE_ICON: Record<DelayCause, LucideIcon> = {
  late_departure: Timer,
  loading_delay: Hourglass,
  congestion: TrafficCone,
  unplanned_stop: OctagonX,
  breakdown: Wrench,
  border_wait: Landmark,
};

/** Minutos perdidos por causa, de mayor a menor. */
export const CausesSection = memo(function CausesSection({
  progress: p,
  state,
}: {
  progress: TripProgress;
  state: DisplayState;
}) {
  if (p.causes.length === 0) return null;
  const max = Math.max(...p.causes.map((c) => c.minutes), 1);
  const total = p.causes.reduce((s, c) => s + c.minutes, 0);
  const tone = toneOf(p, state);

  return (
    <Block title="Por qué va tarde" aside={`${formatDuration(total)} en total`}>
      <ul className="space-y-3">
        {p.causes.map((c) => {
          const Icon = CAUSE_ICON[c.cause] ?? Truck;
          return (
            <li key={c.cause}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={cn("size-3.5 shrink-0", STATE_CLASS[tone].text)} aria-hidden />
                  <span className="truncate">{CAUSE_LABEL[c.cause]}</span>
                </span>
                <span className="font-medium tabular">{formatDuration(c.minutes)}</span>
              </div>
              <Progress
                value={(c.minutes / max) * 100}
                aria-label={`${CAUSE_LABEL[c.cause]}: ${formatDuration(c.minutes)}`}
                className={BAR[tone]}
              />
            </li>
          );
        })}
      </ul>
    </Block>
  );
});
