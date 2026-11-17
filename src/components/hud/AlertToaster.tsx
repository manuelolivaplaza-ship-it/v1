"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useFleetStore } from "@/lib/store";

/**
 * Avisos emergentes (sonner) para las alertas nuevas de severidad `warning` o `critical`.
 * Solo avisa de lo que llega después de montarse: al cargar ya hay decenas en el historial.
 */
export default function AlertToaster() {
  useEffect(() => {
    const seen = new Set(useFleetStore.getState().alerts.map((a) => a.id));
    let followHintShown = false;

    return useFleetStore.subscribe((state, prev) => {
      // Al empezar a seguir un camión con la simulación acelerada, se sugiere pasar a tiempo real:
      // a ×30 el camión cruza la pantalla en un instante y no se aprecia el detalle.
      if (state.followSelected && !prev.followSelected && !followHintShown && state.sim.timeScale > 10) {
        followHintShown = true;
        toast.info("Siguiendo al camión", {
          id: "follow-hint",
          description: `A ×${state.sim.timeScale} se mueve muy rápido. En tiempo real (×1) se ve como un viaje de verdad.`,
          duration: 9000,
          action: {
            label: "Usar ×1",
            onClick: () => useFleetStore.getState().controls?.setTimeScale(1),
          },
        });
      }

      if (state.alerts === prev.alerts) return;
      // Más recientes primero: se avisa en orden cronológico.
      const fresh = state.alerts.filter((a) => !seen.has(a.id)).reverse();
      for (const alert of fresh) {
        seen.add(alert.id);
        if (alert.severity === "info") continue;
        const show = alert.severity === "critical" ? toast.error : toast.warning;
        show(alert.title, {
          id: alert.id,
          description: alert.detail,
          duration: 7000,
          action: {
            label: "Ver camión",
            onClick: () => useFleetStore.getState().selectVehicle(alert.vehicleId),
          },
        });
      }
    });
  }, []);

  return <Toaster position="top-center" visibleToasts={3} closeButton offset={{ top: 16 }} />;
}
