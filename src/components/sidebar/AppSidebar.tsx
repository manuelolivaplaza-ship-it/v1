"use client";

import { motion } from "motion/react";
import { Bell, FlaskConical, PanelLeftClose, Route, Search, Truck, type LucideIcon } from "lucide-react";
import { countByState, useFleetRows, useFleetStore, type SidebarSection } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import AlertsSection from "./AlertsSection";
import CommandMenu, { openCommandMenu } from "./CommandMenu";
import FleetSection from "./FleetSection";
import SimulatorSection from "./SimulatorSection";
import TripsSection from "./TripsSection";

const NAV: { key: SidebarSection; label: string; icon: LucideIcon }[] = [
  { key: "trips", label: "Viajes", icon: Route },
  { key: "fleet", label: "Flota", icon: Truck },
  { key: "alerts", label: "Alertas", icon: Bell },
  { key: "simulator", label: "Simulador", icon: FlaskConical },
];

/**
 * Barra lateral de Traza: integrada al fondo gris (sin tarjeta propia). Marca y búsqueda arriba,
 * navegación, la sección activa con desplazamiento propio y el cumplimiento del día abajo.
 */
export default function AppSidebar() {
  return (
    <>
      <Sidebar variant="inset" collapsible="offcanvas" aria-label="Barra lateral">
        <SidebarHeader className="gap-2 px-3 pt-2.5 pb-0.5">
          <Brand />
          <SearchButton />
        </SidebarHeader>

        <SidebarGroup className="px-3 py-1">
          <SidebarGroupContent>
            <Nav />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarContent className="overflow-hidden">
          <ActiveSection />
        </SidebarContent>

        <SidebarFooter className="px-3 pt-1 pb-2.5">
          <ComplianceCard />
        </SidebarFooter>
      </Sidebar>
      <CommandMenu />
    </>
  );
}

/** Isotipo (una ruta que termina en un punto de posición) y nombre del producto. */
function Brand() {
  const { toggleSidebar } = useSidebar();
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" fill="none" role="img" aria-label="Traza">
        <rect width="32" height="32" rx="8" className="fill-foreground" />
        <path
          d="M7 22c4 0 4-8 8-8s3.5 6 7 6"
          className="stroke-background"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23.5" cy="11.5" r="2.6" className="fill-background" />
      </svg>
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-semibold tracking-tight">Traza</p>
        <p className="truncate text-xs text-muted-foreground">Operación Santiago</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto text-muted-foreground"
        aria-label="Ocultar la barra lateral"
        onClick={toggleSidebar}
      >
        <PanelLeftClose />
      </Button>
    </div>
  );
}

/** Botón con aspecto de campo de búsqueda: abre la paleta de comandos. */
function SearchButton() {
  return (
    <Button
      variant="outline"
      onClick={openCommandMenu}
      aria-label="Buscar camión o viaje (Ctrl K)"
      className="h-8 w-full justify-start gap-2 bg-card px-2.5 text-[13px] font-normal text-muted-foreground shadow-card hover:bg-card hover:text-foreground"
    >
      <Search />
      <span className="flex-1 text-left">Buscar camión, viaje…</span>
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
  );
}

function Nav() {
  const section = useFleetStore((s) => s.section);
  const setSection = useFleetStore((s) => s.setSection);
  return (
    <SidebarMenu aria-label="Secciones" className="gap-0.5">
      {NAV.map(({ key, label, icon: Icon }) => (
        <SidebarMenuItem key={key}>
          <SidebarMenuButton
            isActive={section === key}
            aria-current={section === key ? "page" : undefined}
            onClick={() => setSection(key)}
            className="h-8 border border-transparent text-[13px] data-active:border-border data-active:bg-card data-active:shadow-card"
          >
            <Icon className="text-muted-foreground group-data-active/menu-button:text-foreground" />
            <span>{label}</span>
          </SidebarMenuButton>
          {key === "trips" && <TripsBadge />}
          {key === "alerts" && <AlertsBadge />}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/** Viajes en curso. El selector devuelve un número: solo se pinta si el conteo cambia. */
function TripsBadge() {
  const running = useFleetStore((s) => {
    let n = 0;
    for (const id in s.progress) {
      const st = s.progress[id].status;
      if (st === "on_time" || st === "at_risk" || st === "delayed") n++;
    }
    return n;
  });
  if (running === 0) return null;
  return (
    <SidebarMenuBadge className="right-2 text-muted-foreground" aria-label={`${running} viajes en curso`}>
      {running}
    </SidebarMenuBadge>
  );
}

function AlertsBadge() {
  const unread = useFleetStore((s) => s.unreadAlerts);
  if (unread === 0) return null;
  return (
    <SidebarMenuBadge
      className="right-2 bg-late-soft text-late-ink peer-data-active/menu-button:text-late-ink"
      aria-label={`${unread} alertas sin leer`}
    >
      {unread > 99 ? "99+" : unread}
    </SidebarMenuBadge>
  );
}

function ActiveSection() {
  const section = useFleetStore((s) => s.section);
  return (
    <motion.div
      key={section}
      className="h-full min-h-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {section === "trips" && <TripsSection />}
      {section === "fleet" && <FleetSection />}
      {section === "alerts" && <AlertsSection />}
      {section === "simulator" && <SimulatorSection />}
    </motion.div>
  );
}

/** Cumplimiento: viajes a tiempo sobre los que están en ruta, con el desglose de estados. */
function ComplianceCard() {
  const ready = useFleetStore((s) => s.ready);
  const rows = useFleetRows();
  const c = countByState(rows);

  const enRuta = c.on_time + c.at_risk + c.delayed + c.stopped + c.offline;
  const pct = enRuta > 0 ? Math.round((c.on_time / enRuta) * 100) : null;

  return (
    <div className="flex h-14 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card px-3 shadow-card">
      <div className="flex items-center gap-3">
        <span className="eyebrow shrink-0">Cumplimiento</span>
        {ready ? (
          <span className="shrink-0 text-[13px] leading-none font-semibold tabular">{pct === null ? "—" : `${pct} %`}</span>
        ) : (
          <Skeleton className="h-3.5 w-9" />
        )}
        <Progress
          value={pct ?? 0}
          aria-label="Viajes a tiempo sobre los que están en ruta"
          className="h-1 flex-1 [&_[data-slot=progress-indicator]]:bg-ok"
        />
      </div>
      <p className="flex items-center gap-3 text-[11px] text-muted-foreground tabular">
        {ready ? (
          <>
            <Stat label="En ruta" value={enRuta} />
            <Stat label="En riesgo" value={c.at_risk} dot="bg-warn" />
            <Stat label="Retrasados" value={c.delayed} dot="bg-late" />
          </>
        ) : (
          "Calculando…"
        )}
      </p>
    </div>
  );
}

function Stat({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <span className="flex items-center gap-1">
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />}
      {label} <b className="font-semibold text-foreground">{value}</b>
    </span>
  );
}
