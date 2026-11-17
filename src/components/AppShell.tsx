"use client";

import dynamic from "next/dynamic";
import { useEffect, type CSSProperties } from "react";
import { PanelLeft } from "lucide-react";
import { bootRuntime } from "@/lib/runtime";
import { LAYOUT, useFleetStore } from "@/lib/store";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/sidebar/AppSidebar";
import VehiclePanel from "@/components/detail/VehiclePanel";
import TimeBar from "@/components/hud/TimeBar";
import AlertToaster from "@/components/hud/AlertToaster";

// Mapbox necesita el navegador: el mapa nunca se renderiza en el servidor.
const FleetMap = dynamic(() => import("@/components/map/FleetMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-muted" />,
});

/**
 * Pantalla principal. Barra lateral integrada al fondo gris y, a su derecha, una tarjeta blanca
 * con borde que contiene el mapa; sobre el mapa solo flotan el detalle del camión, los
 * controles y la barra de tiempo.
 */
export default function AppShell() {
  const sidebarOpen = useFleetStore((s) => s.sidebarOpen);
  const setSidebarOpen = useFleetStore((s) => s.setSidebarOpen);

  useEffect(() => bootRuntime(), []);

  return (
    <TooltipProvider delayDuration={200}>
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-svh"
      style={{ "--sidebar-width": LAYOUT.sidebarWidth } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden border border-border">
        <div className="relative min-h-0 flex-1">
          <FleetMap />
          {/* Con la barra abierta, su propio encabezado ya tiene el botón; este aparece al plegarla. */}
          {!sidebarOpen && (
            <SidebarTrigger
              variant="outline"
              size="icon"
              aria-label="Mostrar la barra lateral"
              className="absolute top-3 left-3 z-10 bg-card shadow-card"
            >
              <PanelLeft />
            </SidebarTrigger>
          )}
          <VehiclePanel />
          <TimeBar />
        </div>
      </SidebarInset>
      <AlertToaster />
    </SidebarProvider>
    </TooltipProvider>
  );
}
