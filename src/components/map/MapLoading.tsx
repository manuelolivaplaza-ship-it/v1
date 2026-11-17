"use client";

import type { ReactNode } from "react";
import { MapPinOff, MonitorOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/**
 * Pantalla de carga: no bloquea nada (el mapa ya se está dibujando debajo) y se desvanece
 * cuando llegan los primeros mosaicos o, a lo sumo, a los pocos segundos.
 */
export function MapLoading({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none absolute inset-0 z-20 grid place-items-center bg-muted transition-opacity duration-500 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Spinner aria-label="Cargando" className="size-4" />
        <span>Cargando el mapa…</span>
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 z-20 grid place-items-center overflow-auto bg-muted p-6">{children}</div>;
}

/** Error al cargar el mapa, con botón para volver a crearlo. */
export function MapError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Notice>
      <Empty className="max-w-md flex-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOff />
          </EmptyMedia>
          <EmptyTitle>No se pudo cargar el mapa</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            <RotateCw data-icon="inline-start" />
            Reintentar
          </Button>
        </EmptyContent>
      </Empty>
    </Notice>
  );
}

/** El navegador no puede crear un contexto WebGL. */
export function WebglUnsupported() {
  return (
    <Notice>
      <Empty className="max-w-md flex-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MonitorOff />
          </EmptyMedia>
          <EmptyTitle>WebGL no está disponible</EmptyTitle>
          <EmptyDescription>
            Tu navegador no pudo iniciar WebGL. Activa la aceleración por hardware o prueba con otro navegador.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Notice>
  );
}

/** Mensaje cuando no hay token de Mapbox configurado. */
export function MissingToken() {
  return (
    <Notice>
      <Empty className="max-w-md flex-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOff />
          </EmptyMedia>
          <EmptyTitle>Falta el token de Mapbox</EmptyTitle>
          <EmptyDescription>
            Define la variable{" "}
            <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-foreground">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            en <code className="font-mono text-xs text-foreground">.env.local</code> con un token público (pk.*) y reinicia el
            servidor.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Notice>
  );
}
