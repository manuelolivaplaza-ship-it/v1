"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { Search, SearchX, X } from "lucide-react";
import { ROUTE_BY_ID } from "@/data";
import {
  ACTIVITY_LABEL,
  CAUSE_LABEL,
  STATE_CLASS,
  formatClock,
  formatDelay,
  formatDuration,
} from "@/lib/labels";
import { RULES } from "@/lib/planning";
import { useFleetRows, useFleetStore, type FleetRow } from "@/lib/store";
import type { DisplayState, TripProgress, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { normalize, vehicleHaystack } from "./search";
import { SectionFrame, SkeletonRows, rowClass, useRowInteraction } from "./shared";

type FilterKey = "all" | "delayed" | "at_risk" | "on_time" | "halted" | "scheduled" | "completed";

const FILTERS: { key: FilterKey; label: string; match: (s: DisplayState) => boolean; tone?: DisplayState }[] = [
  { key: "all", label: "Todos", match: () => true },
  { key: "delayed", label: "Retrasados", match: (s) => s === "delayed", tone: "delayed" },
  { key: "at_risk", label: "En riesgo", match: (s) => s === "at_risk", tone: "at_risk" },
  { key: "on_time", label: "A tiempo", match: (s) => s === "on_time", tone: "on_time" },
  { key: "halted", label: "Detenidos", match: (s) => s === "stopped" || s === "offline", tone: "stopped" },
  { key: "scheduled", label: "Programados", match: (s) => s === "scheduled", tone: "scheduled" },
  { key: "completed", label: "Completados", match: (s) => s === "completed", tone: "completed" },
];

// Búsqueda y filtro viven fuera del componente para sobrevivir al cambio de sección.
const useTripsFilter = create<{
  query: string;
  filter: FilterKey;
  setQuery(q: string): void;
  setFilter(f: FilterKey): void;
}>()((set) => ({
  query: "",
  filter: "all",
  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
}));

export default function TripsSection() {
  const ready = useFleetStore((s) => s.ready);
  const rows = useFleetRows();
  const query = useTripsFilter((s) => s.query);
  const filter = useTripsFilter((s) => s.filter);
  const setQuery = useTripsFilter((s) => s.setQuery);
  const setFilter = useTripsFilter((s) => s.setFilter);

  const counts = useMemo(() => {
    const c = {} as Record<FilterKey, number>;
    for (const f of FILTERS) c[f.key] = 0;
    for (const r of rows) for (const f of FILTERS) if (f.match(r.state)) c[f.key]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    const q = normalize(query.trim());
    return rows.filter((r) => match(r.state) && (!q || vehicleHaystack(r.vehicle, r.trip).includes(q)));
  }, [rows, filter, query]);

  const summary = !ready ? "Cargando…" : `${visible.length} de ${rows.length} camiones`;

  return (
    <SectionFrame
      title="Viajes"
      summary={summary}
      toolbar={
        <div className="space-y-1.5">
          <InputGroup className="h-8 bg-card">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Unidad, patente, conductor, cliente…"
              aria-label="Buscar viajes"
              className="text-[13px] md:text-[13px] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}>
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <ChipRow>
            {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0 || f.key === filter).map((f) => {
              const active = f.key === filter;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f.tone && <span className={cn("size-1.5 rounded-full", STATE_CLASS[f.tone].dot)} />}
                  {f.label}
                  <span className={cn("tabular", active ? "text-background/70" : "text-muted-foreground/70")}>
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </ChipRow>
        </div>
      }
    >
      {!ready ? (
        <SkeletonRows />
      ) : visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Sin resultados</EmptyTitle>
            <EmptyDescription>Ningún viaje coincide con la búsqueda o el filtro elegido.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((r) => (
            <TripRow key={r.vehicle.id} vehicle={r.vehicle} trip={r.trip} progress={r.progress} state={r.state} />
          ))}
        </ul>
      )}
    </SectionFrame>
  );
}

interface TripRowProps {
  vehicle: Vehicle;
  trip: FleetRow["trip"];
  progress: TripProgress | null;
  state: DisplayState;
}

// Props por referencia estable: la fila solo se pinta cuando su viaje cambió de verdad.
const TripRow = memo(function TripRow({ vehicle, trip, progress, state }: TripRowProps) {
  const { ref, selected, hovered, onSelect, onEnter, onLeave } = useRowInteraction(vehicle.id);
  const cls = STATE_CLASS[state];
  const route = trip ? ROUTE_BY_ID[trip.routeId] : undefined;
  const pulse = state === "delayed" || state === "stopped";

  let metric: React.ReactNode = null;
  let detail: string;
  let detailTone = "text-muted-foreground";

  if (!trip || !progress) {
    detail = "Sin viajes asignados";
  } else if (state === "scheduled") {
    metric = <span className="text-muted-foreground">Sale {formatClock(trip.plannedDeparture)}</span>;
    detail = `Llegada comprometida ${formatClock(trip.committedArrival)}`;
  } else if (state === "completed") {
    const arrival = progress.actualArrival ?? progress.eta;
    metric = <span className="text-muted-foreground">Llegó {formatClock(arrival)}</span>;
    detail =
      progress.delayMin >= RULES.toleranceMin
        ? `Llegó con ${formatDuration(progress.delayMin)} de retraso`
        : progress.delayMin <= -RULES.toleranceMin
          ? `Llegó ${formatDuration(-progress.delayMin)} antes`
          : "Llegó a tiempo";
  } else {
    metric = (
      <>
        <span className="text-muted-foreground">ETA {formatClock(progress.eta)}</span>
        <span className={cn("font-semibold", cls.text)}>{formatDelay(progress.delayMin)}</span>
      </>
    );
    const top = progress.causes[0];
    if ((state === "delayed" || state === "at_risk") && top) {
      detail = `${CAUSE_LABEL[top.cause]} · ${formatDuration(top.minutes)}`;
      detailTone = cls.text;
    } else {
      detail = ACTIVITY_LABEL[progress.activity];
      if (state === "stopped" || state === "offline") detailTone = cls.text;
    }
  }

  const pct = !progress ? 0 : state === "completed" ? 1 : progress.progressPct;

  return (
    // Sin animación de reordenamiento (`layout`): medía las 30 filas en cada actualización y
    // dejaba la página ocupada casi la mitad del tiempo, ahogando al mapa.
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
          <StatusDot state={state} pulse={pulse} />
          <span className="text-[13px] font-semibold tracking-tight">{vehicle.unit}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{vehicle.plate}</span>
          <span className="ml-auto flex items-baseline gap-2 text-xs tabular">{metric}</span>
        </div>
        <p className="mt-1 truncate pl-4 text-[13px] leading-tight">
          {route ? route.name : "—"}
          {trip && <span className="text-xs text-muted-foreground"> · {trip.client}</span>}
        </p>
        <div className="mt-1.5 pl-4">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500 ease-out", cls.dot)}
              style={{ width: `${Math.round(pct * 1000) / 10}%`, opacity: state === "completed" ? 0.5 : 1 }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
            <span className={cn("truncate", detailTone)}>{detail}</span>
            {progress && state !== "scheduled" && (
              <span className="shrink-0 text-muted-foreground tabular">{Math.round(pct * 100)}%</span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
});

/** Una sola fila de filtros con desplazamiento horizontal, sin barra y con degradado si hay más a la derecha. */
function ChipRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Filtrar por estado"
      className={cn(
        "flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0",
        more && "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]",
      )}
    >
      {children}
    </div>
  );
}
