import type { Position } from "../types/wizard";

export interface GeocodeResult { label: string; center: Position; type: string; country: string; countryCode: string; department: string; municipality: string }

// La interfaz solo consulta el endpoint propio; el servidor aplica User-Agent y limita el proveedor público.
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 429 ? "Hay muchas búsquedas seguidas. Espera un momento e inténtalo otra vez." : "No se pudo buscar esa ubicación.");
  return response.json() as Promise<GeocodeResult[]>;
}
