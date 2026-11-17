"use client";

import { AlertTriangle } from "lucide-react";
import { memo } from "react";
import { useFleetStore } from "@/lib/store";
import { Block } from "./parts";

const nf = new Intl.NumberFormat("es-CL");

function Tile({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted px-2.5 py-2">
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg leading-none font-semibold tracking-tight tabular">{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground tabular">{sub}</div>}
    </div>
  );
}

/** Telemetría en vivo. Cada selector devuelve un valor redondeado: solo re-renderiza cuando cambia la cifra visible. */
export const LiveSection = memo(function LiveSection({
  vehicleId,
  fuelCapacityL,
}: {
  vehicleId: string;
  fuelCapacityL: number;
}) {
  const hasData = useFleetStore((s) => !!s.telemetry[vehicleId]);
  const speed = useFleetStore((s) => Math.round(s.telemetry[vehicleId]?.speedKmh ?? 0));
  const ignition = useFleetStore((s) => s.telemetry[vehicleId]?.ignition ?? false);
  const fuel = useFleetStore((s) => Math.round(s.telemetry[vehicleId]?.fuelPct ?? 0));
  const odo = useFleetStore((s) => Math.round(s.telemetry[vehicleId]?.odometerKm ?? 0));
  const fault = useFleetStore((s) => s.telemetry[vehicleId]?.faultCode ?? null);

  if (!hasData) {
    return (
      <Block title="En vivo">
        <p className="text-[13px] text-muted-foreground">Sin datos de telemetría todavía.</p>
      </Block>
    );
  }

  const litres = Math.round((fuel / 100) * fuelCapacityL);
  return (
    <Block title="En vivo">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Velocidad" value={String(speed)} unit="km/h" sub={ignition ? "Motor encendido" : "Motor apagado"} />
        <Tile label="Combustible" value={String(fuel)} unit="%" sub={`≈ ${nf.format(litres)} L`} />
        <Tile label="Odómetro" value={nf.format(odo)} unit="km" />
      </div>
      {fault && (
        <div
          role="alert"
          className="mt-2 flex items-center gap-2 rounded-lg border border-late/20 bg-late-soft px-2.5 py-2 text-[13px] text-late-ink"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="font-medium">Falla activa</span>
          <span className="ml-auto rounded bg-card px-1.5 py-0.5 font-mono text-[11px]">{fault}</span>
        </div>
      )}
    </Block>
  );
});
