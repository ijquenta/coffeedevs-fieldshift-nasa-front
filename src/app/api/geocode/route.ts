import { NextRequest, NextResponse } from "next/server";

const cache = new Map<string, { expires: number; results: unknown[] }>();
let lastProviderRequestAt = 0;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 120) return NextResponse.json({ error: "La búsqueda debe tener entre 3 y 120 caracteres." }, { status: 400 });
  const cacheKey = query.toLocaleLowerCase("es");
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.results, { headers: { "Cache-Control": "private, max-age=60" } });
  if (Date.now() - lastProviderRequestAt < 1100) return NextResponse.json({ error: "Espera un segundo antes de hacer otra búsqueda." }, { status: 429, headers: { "Retry-After": "1" } });
  lastProviderRequestAt = Date.now();
  const contact = process.env.GEOCODER_CONTACT_EMAIL;
  const userAgent = `YanapiriAgro/1.0 (NASA Space Apps 2026${contact ? `; contact: ${contact}` : ""})`;
  try {
    const upstream = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": userAgent, "Accept-Language": "es" }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!upstream.ok) return NextResponse.json({ error: "El servicio de mapas no respondió." }, { status: 502 });
    const results: unknown = await upstream.json();
    if (!Array.isArray(results)) return NextResponse.json({ error: "Respuesta de geocodificación no válida." }, { status: 502 });
    const normalized = results.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const value = item as { display_name?: unknown; lon?: unknown; lat?: unknown; type?: unknown; address?: { country?: unknown; country_code?: unknown; state?: unknown; city?: unknown; town?: unknown; village?: unknown; municipality?: unknown } };
      const longitude = Number(value.lon), latitude = Number(value.lat);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || typeof value.display_name !== "string") return [];
      const address = value.address ?? {};
      const municipality = address.city ?? address.town ?? address.village ?? address.municipality;
      return [{ label: value.display_name, center: [longitude, latitude] as [number, number], type: typeof value.type === "string" ? value.type : "lugar", country: typeof address.country === "string" ? address.country : "", countryCode: typeof address.country_code === "string" ? address.country_code.toUpperCase() : "", department: typeof address.state === "string" ? address.state : "", municipality: typeof municipality === "string" ? municipality : "" }];
    });
    cache.set(cacheKey, { expires: Date.now() + 60_000, results: normalized });
    return NextResponse.json(normalized, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "No se pudo conectar con el geocodificador. Revisa tu conexión e inténtalo otra vez." }, { status: 502 });
  }
}
