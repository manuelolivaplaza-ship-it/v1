"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LAYOUT, useFleetStore } from "@/lib/store";
import type { CameraController } from "./camera";
import { NARROW_PX } from "./config";

interface Props {
  map: MapboxMap;
  camera: CameraController;
}

function Btn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Aguja de brújula: la punta roja marca el norte y gira al rotar el mapa. */
function CompassNeedle({ bearing }: { bearing: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px] transition-transform duration-100"
      style={{ transform: `rotate(${-bearing}deg)` }}
      aria-hidden
    >
      <path d="M12 2.5 17 12H7L12 2.5Z" fill="var(--color-late)" />
      <path d="M12 21.5 7 12h10l-5 9.5Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/** Controles propios del mapa, abajo a la derecha. Se corren a la izquierda del panel de detalle. */
export default function MapControls({ map, camera }: Props) {
  const hasSelection = useFleetStore((s) => !!s.selectedVehicleId);
  // Ancho de la ventana, igual que el panel de detalle (`md` de Tailwind), no el del contenedor.
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_PX);
  const [view, setView] = useState({ pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()) });

  useEffect(() => {
    const update = () => {
      const pitch = Math.round(map.getPitch());
      const bearing = Math.round(map.getBearing());
      setView((v) => (v.pitch === pitch && v.bearing === bearing ? v : { pitch, bearing }));
    };
    map.on("rotate", update);
    map.on("pitch", update);
    map.on("moveend", update);
    // En pantallas angostas el detalle es una hoja inferior y los controles se ocultan al seleccionar.
    const onResize = () => setNarrow(window.innerWidth < NARROW_PX);
    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
      map.off("rotate", update);
      map.off("pitch", update);
      map.off("moveend", update);
    };
  }, [map]);

  const is3D = view.pitch > 10;
  if (hasSelection && narrow) return null;
  const right = hasSelection ? LAYOUT.detailW + 2 * LAYOUT.gap : LAYOUT.gap;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="absolute bottom-9 z-10 flex flex-col gap-2 transition-[right] duration-500 ease-(--ease-out-expo)"
        style={{ right }}
      >
        <ButtonGroup orientation="vertical" aria-label="Zoom" className="rounded-lg shadow-float">
          <Btn label="Acercar" onClick={() => camera.zoomBy(1)}>
            <Plus />
          </Btn>
          <Btn label="Alejar" onClick={() => camera.zoomBy(-1)}>
            <Minus />
          </Btn>
        </ButtonGroup>
        <ButtonGroup orientation="vertical" aria-label="Vista" className="rounded-lg shadow-float">
          <Btn label="Vista general" onClick={() => camera.resetView()}>
            <Maximize2 />
          </Btn>
          <Btn label={is3D ? "Cambiar a vista 2D" : "Cambiar a vista 3D"} onClick={() => camera.toggle3D()}>
            <span className="text-xs font-semibold tracking-tight">{is3D ? "2D" : "3D"}</span>
          </Btn>
          <Btn label="Norte arriba" onClick={() => camera.resetNorth()}>
            <CompassNeedle bearing={view.bearing} />
          </Btn>
        </ButtonGroup>
      </div>
    </TooltipProvider>
  );
}
