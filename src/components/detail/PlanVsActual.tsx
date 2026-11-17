"use client";

import { motion } from "motion/react";
import { memo, useMemo, type ReactNode } from "react";
import { PLACE_BY_ID, ROUTE_BY_ID } from "@/data";
import { STATE_COLOR, formatClock, formatDuration } from "@/lib/labels";
import { RULES, planRoute } from "@/lib/planning";
import { useFleetStore } from "@/lib/store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Activity, DisplayState, RouteDef, Trip, TripProgress } from "@/lib/types";
import { Block, EASE, toneOf } from "./parts";

const MIN = 60_000;
const TRACK_H = 28;
const TRACK_GAP = 8;

interface Seg {
  activity: Activity;
  start: number;
  end: number;
  label: string;
}

/** Color por actividad, sobrio para fondo blanco; el mismo en plan y en real para poder compararlos. */
const FILL: Record<Activity, string> = {
  loading: "#8b83c9",
  unloading: "#a8a2d6",
  driving: "#6f9bea",
  resting: "#9aa6b8",
  border_wait: "#dfa23f",
  stopped: "#de6a6e",
  offline: "#c3c8d1",
  idle: "#d4d8de",
};

/** Filas de la tabla comparativa (hace también de leyenda). */
const ROWS: { activity: Activity; label: string }[] = [
  { activity: "loading", label: "Carga" },
  { activity: "driving", label: "Conducción" },
  { activity: "resting", label: "Descanso" },
  { activity: "border_wait", label: "Espera en aduana" },
  { activity: "stopped", label: "Detención" },
  { activity: "unloading", label: "Descarga" },
  { activity: "offline", label: "Sin señal" },
];

/** Actividades que el plan sí contempla: solo ahí se puede medir el desvío. */
const PLANNED = new Set<Activity>(["loading", "driving", "resting", "border_wait"]);

const SEG_NAME: Record<Activity, string> = {
  idle: "Sin viaje",
  loading: "Carga",
  driving: "Conducción",
  resting: "Descanso obligatorio",
  stopped: "Detención no planificada",
  border_wait: "Control",
  unloading: "Descarga",
  offline: "Sin señal",
};

/** Arma la pista del plan: carga, conducción, descansos y controles en orden. */
function buildPlan(trip: Trip, route: RouteDef): Seg[] {
  const plan = planRoute(route);
  const segs: Seg[] = [];
  const loadEnd = trip.plannedLoadStart + trip.plannedLoadMin * MIN;
  segs.push({ activity: "loading", start: trip.plannedLoadStart, end: loadEnd, label: "Carga" });

  interface Ev {
    at: number;
    activity: Activity;
    dur: number;
    label: string;
  }
  const events: Ev[] = [];
  for (let k = 1; k <= plan.restStops; k++) {
    events.push({
      at: k * RULES.maxContinuousDrivingMin,
      activity: "resting",
      dur: RULES.mandatoryRestMin,
      label: "Descanso obligatorio",
    });
  }
  for (const c of route.checkpoints) {
    if (c.plannedWaitMin <= 0) continue;
    events.push({
      at: (c.km / route.distanceKm) * plan.drivingMin,
      activity: "border_wait",
      dur: c.plannedWaitMin,
      label: `Control ${PLACE_BY_ID[c.placeId]?.shortName ?? ""}`.trim(),
    });
  }
  events.sort((a, b) => a.at - b.at);

  let cursor = trip.plannedDeparture;
  let driven = 0;
  for (const ev of events) {
    const at = Math.min(ev.at, plan.drivingMin);
    if (at > driven) {
      segs.push({ activity: "driving", start: cursor, end: cursor + (at - driven) * MIN, label: "Conducción" });
      cursor += (at - driven) * MIN;
      driven = at;
    }
    segs.push({ activity: ev.activity, start: cursor, end: cursor + ev.dur * MIN, label: ev.label });
    cursor += ev.dur * MIN;
  }
  if (driven < plan.drivingMin) {
    segs.push({
      activity: "driving",
      start: cursor,
      end: cursor + (plan.drivingMin - driven) * MIN,
      label: "Conducción",
    });
  }
  return segs;
}

/** Paso del eje en horas, de modo que haya como máximo ~5 marcas. */
function niceStepHours(spanMs: number): number {
  const h = spanMs / 3_600_000;
  for (const s of [1, 2, 3, 4, 6, 12]) if (h / s <= 5) return s;
  return 24;
}

/** Minutos totales por actividad. */
function sumByActivity(segs: Seg[]): Map<Activity, number> {
  const m = new Map<Activity, number>();
  for (const s of segs) m.set(s.activity, (m.get(s.activity) ?? 0) + (s.end - s.start) / MIN);
  return m;
}

/** La pieza distintiva: lo planificado y lo real sobre un mismo eje de tiempo. */
export const PlanVsActual = memo(function PlanVsActual({
  trip,
  progress: p,
  state,
}: {
  trip: Trip;
  progress: TripProgress;
  state: DisplayState;
}) {
  // El reloj se redondea a 1 min simulado para no re-renderizar 10 veces por segundo.
  const now = useFleetStore((s) => Math.floor(s.now / MIN) * MIN);
  const route = ROUTE_BY_ID[trip.routeId];

  const plan = useMemo(() => (route ? buildPlan(trip, route) : []), [trip, route]);

  const real = useMemo<Seg[]>(() => {
    const out: Seg[] = [];
    for (const t of p.timeline) {
      if (t.activity === "idle") continue;
      const end = t.end ?? Math.max(now, t.start);
      if (end <= t.start) continue;
      const place = t.placeId ? PLACE_BY_ID[t.placeId]?.shortName : undefined;
      out.push({
        activity: t.activity,
        start: t.start,
        end,
        label: place && t.activity !== "driving" ? `${SEG_NAME[t.activity]} · ${place}` : SEG_NAME[t.activity],
      });
    }
    return out;
  }, [p.timeline, now]);

  // Tiempo por actividad: plan contra real. El desvío solo se marca cuando ya es seguro (real > plan).
  const rows = useMemo(() => {
    const planMin = sumByActivity(plan);
    const realMin = sumByActivity(real);
    return ROWS.filter((r) => planMin.has(r.activity) || realMin.has(r.activity)).map((r) => {
      const pl = planMin.get(r.activity) ?? 0;
      const re = realMin.get(r.activity) ?? 0;
      const measurable = PLANNED.has(r.activity) || r.activity === "stopped";
      const loss = measurable ? re - pl : 0;
      return {
        ...r,
        plan: PLANNED.has(r.activity) && pl > 0 ? formatDuration(pl) : "—",
        real: re > 0 ? formatDuration(re) : "—",
        loss: loss >= RULES.toleranceMin ? `+${formatDuration(loss)}` : null,
      };
    });
  }, [plan, real]);

  if (!route) return null;

  const completed = p.status === "completed";
  const lastRealEnd = real.length ? real[real.length - 1].end : 0;
  const start = Math.min(trip.plannedLoadStart, real.length ? real[0].start : Infinity);
  const end = Math.max(trip.committedArrival, p.eta, lastRealEnd, start + 3_600_000);
  const span = end - start;
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));

  const tailFrom = Math.max(now, lastRealEnd);
  const showTail = !completed && p.eta > tailFrom;
  const tailColor = STATE_COLOR[toneOf(p, state)];
  const showNow = !completed && now >= start && now <= end;

  // Eje: horas redondas.
  const step = niceStepHours(span) * 3_600_000;
  const ticks: number[] = [];
  for (let t = Math.ceil(start / step) * step; t < end; t += step) {
    if (pos(t) > 4 && pos(t) < 96) ticks.push(t);
  }

  const tracksH = TRACK_H * 2 + TRACK_GAP;

  return (
    <>
      <Block title="Plan contra realidad" aside={`${formatClock(start)} – ${formatClock(end)}`}>
        <div className="flex gap-2.5">
          {/* Etiquetas de pista */}
          <div className="flex w-8 shrink-0 flex-col text-xs font-medium" style={{ gap: TRACK_GAP }}>
            <span className="flex items-center text-muted-foreground" style={{ height: TRACK_H }}>
              Plan
            </span>
            <span className="flex items-center" style={{ height: TRACK_H }}>
              Real
            </span>
          </div>

          <div className="relative min-w-0 flex-1">
            <div className="flex flex-col" style={{ gap: TRACK_GAP }}>
              <Track id={`plan-${trip.id}`}>
                {plan.map((s, i) => (
                  <Bar key={i} seg={s} left={pos(s.start)} width={pos(s.end) - pos(s.start)} muted />
                ))}
              </Track>

              <Track id={`real-${trip.id}`} empty={real.length === 0 && !showTail ? "Aún sin registros" : undefined}>
                {real.map((s, i) => (
                  <Bar key={i} seg={s} left={pos(s.start)} width={pos(s.end) - pos(s.start)} />
                ))}
                {showTail && (
                  <Tip
                    title="Hasta la ETA"
                    detail={`${formatClock(tailFrom)}–${formatClock(p.eta)} · ${formatDuration((p.eta - tailFrom) / MIN)}`}
                  >
                    <div
                      className="absolute inset-y-[3px] rounded-[5px] border border-dashed"
                      style={{
                        left: `${pos(tailFrom)}%`,
                        width: `${Math.max(0.5, pos(p.eta) - pos(tailFrom))}%`,
                        borderColor: tailColor,
                        backgroundImage: `repeating-linear-gradient(135deg, ${tailColor}33 0 4px, transparent 4px 8px)`,
                      }}
                    />
                  </Tip>
                )}
              </Track>
            </div>

            {/* Líneas verticales sobre ambas pistas: hora comprometida y ahora */}
            <div className="pointer-events-none absolute inset-x-0 -top-1" style={{ height: tracksH + 8 }}>
              <div
                className="absolute inset-y-0 border-l border-dashed border-foreground/60"
                style={{ left: `${pos(trip.committedArrival)}%` }}
              />
              {showNow && (
                <motion.div
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                  initial={false}
                  animate={{ left: `${pos(now)}%` }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              )}
            </div>

            {/* Eje de horas */}
            <div className="relative mt-2 h-3.5">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground tabular"
                  style={{ left: `${pos(t)}%` }}
                >
                  {formatClock(t)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="h-3 border-l border-dashed border-foreground/60" />
            Comprometido <span className="font-medium text-foreground tabular">{formatClock(trip.committedArrival)}</span>
          </li>
          {showNow && (
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 rounded-full bg-foreground" />
              Ahora <span className="font-medium text-foreground tabular">{formatClock(now)}</span>
            </li>
          )}
          {showTail && (
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-3.5 rounded-sm border border-dashed" style={{ borderColor: tailColor }} />
              Hasta la ETA <span className="font-medium text-foreground tabular">{formatClock(p.eta)}</span>
            </li>
          )}
        </ul>
      </Block>

      <Block title="Tiempo por actividad" aside={rows.some((r) => r.loss) ? "Dónde se perdió" : undefined}>
        <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-x-2 gap-y-2 text-[13px]">
          <span />
          <span className="eyebrow text-right">Plan</span>
          <span className="eyebrow text-right">Real</span>
          <span className="eyebrow text-right">Desvío</span>
          {rows.map((r) => (
            <RowCells key={r.activity} row={r} />
          ))}
        </div>
      </Block>
    </>
  );
});

function RowCells({
  row,
}: {
  row: { activity: Activity; label: string; plan: string; real: string; loss: string | null };
}) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: FILL[row.activity] }} />
        <span className="truncate">{row.label}</span>
      </span>
      <span className="text-right whitespace-nowrap text-muted-foreground tabular">{row.plan}</span>
      <span className="text-right font-medium whitespace-nowrap tabular">{row.real}</span>
      <span className={cn("text-right whitespace-nowrap tabular",row.loss ? "font-medium text-late-ink" : "text-muted-foreground")}>
        {row.loss ?? "—"}
      </span>
    </>
  );
}

/** Tooltip de un segmento: nombre y rango horario. */
function Tip({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="tabular opacity-80">{detail}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Pista horizontal; se revela de izquierda a derecha al montar. */
function Track({ id, children, empty }: { id: string; children: ReactNode; empty?: string }) {
  return (
    <div className="relative overflow-hidden rounded-md bg-muted" style={{ height: TRACK_H }}>
      <motion.div
        key={id}
        className="absolute inset-0"
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {children}
      </motion.div>
      {empty && <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">{empty}</span>}
    </div>
  );
}

function Bar({ seg, left, width, muted = false }: { seg: Seg; left: number; width: number; muted?: boolean }) {
  const dur = formatDuration((seg.end - seg.start) / MIN);
  const range = `${formatClock(seg.start)}–${formatClock(seg.end)}`;
  return (
    <Tip title={seg.label} detail={`${range} · ${dur}`}>
      <div
        role="img"
        aria-label={`${seg.label}, ${range}, ${dur}`}
        className="absolute inset-y-[3px] rounded-[5px]"
        style={{
          left: `${left}%`,
          width: `${Math.max(0.6, width)}%`,
          background: FILL[seg.activity],
          opacity: muted ? 0.4 : 1,
          boxShadow: "inset -1px 0 0 var(--card)",
          backgroundImage:
            seg.activity === "offline"
              ? "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 3px, transparent 3px 6px)"
              : undefined,
        }}
      />
    </Tip>
  );
}
