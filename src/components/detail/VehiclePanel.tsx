"use client";

import { LocateFixed, Truck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";
import { useFleetStore, useVehicleDetail } from "@/lib/store";
import { StatusPill } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrivalCard } from "./ArrivalCard";
import { CausesSection } from "./CausesSection";
import { DrivingHours } from "./DrivingHours";
import { LiveSection } from "./LiveSection";
import { PeopleCargo } from "./PeopleCargo";
import { PlanVsActual } from "./PlanVsActual";
import { RouteSection } from "./RouteSection";
import { VehicleAlerts } from "./VehicleAlerts";
import { EASE, Pane } from "./parts";

const SCROLL = "scroll-thin min-h-0 overflow-y-auto overscroll-contain border-t border-border";

const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

/** Panel flotante de detalle del camión seleccionado, dentro de la tarjeta del mapa. */
export default function VehiclePanel() {
  const id = useFleetStore((s) => s.selectedVehicleId);
  return <AnimatePresence>{id ? <Panel key="vehicle-panel" vehicleId={id} /> : null}</AnimatePresence>;
}

function Panel({ vehicleId }: { vehicleId: string }) {
  const detail = useVehicleDetail(vehicleId);
  const follow = useFleetStore((s) => s.followSelected);
  const setFollow = useFleetStore((s) => s.setFollow);
  const selectVehicle = useFleetStore((s) => s.selectVehicle);

  // Escape cierra el panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectVehicle(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectVehicle]);

  // Solo para elegir la dirección de la animación; el layout lo resuelve CSS.
  const mobile = useIsMobile();
  const offset = mobile ? { y: 24 } : { x: 24 };

  const trip = detail?.trip ?? null;
  const progress = detail?.progress ?? null;
  const state = detail?.state ?? "idle";

  return (
    <motion.aside
      aria-label="Detalle del camión"
      // md:w-[392px] debe coincidir con LAYOUT.detailW (392); gap 12 = top-3/right-3/bottom-3.
      className="absolute top-3 right-3 bottom-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-[13px] shadow-float md:w-[392px] md:max-w-[calc(100%-24px)] max-md:inset-x-2 max-md:top-auto max-md:bottom-2 max-md:max-h-[62%] max-md:w-auto"
      initial={{ ...offset, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={{ ...offset, opacity: 0, transition: { duration: 0.2, ease: EASE } }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      <TooltipProvider delayDuration={250}>
        {/* Cabecera fija */}
        <header className="flex items-start gap-2 px-4 pt-3.5 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl leading-7 font-semibold tracking-tight">{detail?.vehicle.unit ?? "—"}</h2>
              {detail && <StatusPill state={state} />}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {detail && (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-foreground">
                  {detail.vehicle.plate}
                </span>
              )}
              {trip && <span className="tabular">Viaje {trip.id}</span>}
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={follow ? "default" : "outline"}
                aria-pressed={follow}
                onClick={() => setFollow(!follow)}
                className="h-8 px-2.5 text-[13px] max-md:h-9"
              >
                <LocateFixed aria-hidden />
                {follow ? "Siguiendo" : "Seguir"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {follow ? "Dejar de centrar el mapa en este camión" : "Centrar el mapa en este camión"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Cerrar detalle"
                className="max-md:size-9"
                onClick={() => selectVehicle(null)}
              >
                <X aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Cerrar · Esc</TooltipContent>
          </Tooltip>
        </header>

        {!detail ? (
          <p className="border-t border-border px-4 py-8 text-center text-muted-foreground">Cargando datos del camión…</p>
        ) : trip && progress ? (
          <>
            {/* Llegada: siempre visible */}
            <div className="px-4 pb-3">
              <ArrivalCard trip={trip} progress={progress} state={state} />
            </div>

            <Tabs defaultValue="summary" className="min-h-0 flex-1 gap-0">
              <div className="px-4 pb-3">
                <TabsList className="w-full">
                  <TabsTrigger value="summary" className="text-[13px]">
                    Resumen
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="text-[13px]">
                    Línea de tiempo
                  </TabsTrigger>
                  <TabsTrigger value="details" className="text-[13px]">
                    Detalles
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="summary" className={SCROLL}>
                <Pane key={vehicleId}>
                  <RouteSection trip={trip} progress={progress} state={state} />
                  <CausesSection progress={progress} state={state} />
                  <LiveSection vehicleId={vehicleId} fuelCapacityL={detail.vehicle.fuelCapacityL} />
                  <DrivingHours progress={progress} />
                </Pane>
              </TabsContent>

              <TabsContent value="timeline" className={SCROLL}>
                <Pane key={vehicleId}>
                  <PlanVsActual trip={trip} progress={progress} state={state} />
                </Pane>
              </TabsContent>

              <TabsContent value="details" className={SCROLL}>
                <Pane key={vehicleId}>
                  <PeopleCargo vehicle={detail.vehicle} trip={trip} />
                  <VehicleAlerts vehicleId={vehicleId} />
                </Pane>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <>
            <div className="px-4 pb-3">
              <Empty className="border border-border bg-muted/40 py-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Truck aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>Sin viaje asignado</EmptyTitle>
                  <EmptyDescription>Este camión no tiene viajes programados ni en curso.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
            <div className={`${SCROLL} flex-1`}>
              <Pane key={vehicleId}>
                <LiveSection vehicleId={vehicleId} fuelCapacityL={detail.vehicle.fuelCapacityL} />
                <PeopleCargo vehicle={detail.vehicle} trip={null} />
                <VehicleAlerts vehicleId={vehicleId} />
              </Pane>
            </div>
          </>
        )}
      </TooltipProvider>
    </motion.aside>
  );
}
