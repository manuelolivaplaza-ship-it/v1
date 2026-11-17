"use client";

import { Phone } from "lucide-react";
import { memo } from "react";
import { TRAILER_LABEL } from "@/lib/labels";
import type { Trip, Vehicle } from "@/lib/types";
import { Block, Field, Fields } from "./parts";

/** Conductor, vehículo y carga (tres bloques). */
export const PeopleCargo = memo(function PeopleCargo({ vehicle, trip }: { vehicle: Vehicle; trip: Trip | null }) {
  return (
    <>
      <Block title="Conductor">
        <Fields>
          <Field label="Nombre" title={vehicle.driver.name}>
            {vehicle.driver.name}
          </Field>
          <Field label="Teléfono">
            <a
              href={`tel:${vehicle.driver.phone.replace(/[^+\d]/g, "")}`}
              className="inline-flex items-center gap-1.5 rounded text-info-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Phone className="size-3" aria-hidden />
              {vehicle.driver.phone}
            </a>
          </Field>
        </Fields>
      </Block>

      <Block title="Vehículo">
        <Fields>
          <Field label="Modelo" title={vehicle.model}>
            {vehicle.model}
          </Field>
          <Field label="Remolque">{TRAILER_LABEL[vehicle.trailer]}</Field>
          <Field label="Patente">
            <span className="font-mono text-xs tracking-wide">{vehicle.plate}</span>
          </Field>
        </Fields>
      </Block>

      {trip && (
        <Block title="Carga">
          <Fields>
            <Field label="Descripción" title={trip.cargo.description}>
              {trip.cargo.description}
            </Field>
            <Field label="Peso">{trip.cargo.weightTon.toLocaleString("es-CL")} t</Field>
            <Field label="Guía">{trip.cargo.waybill}</Field>
            <Field label="Cliente" title={trip.client}>
              {trip.client}
            </Field>
          </Fields>
        </Block>
      )}
    </>
  );
});
