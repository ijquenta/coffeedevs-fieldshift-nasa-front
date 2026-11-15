import type { GeoPolygon, Position } from "../types/wizard";

export const DEFAULT_PARCEL_AREA = 12_000; // m²
export const MIN_PARCEL_HA = Number(process.env.NEXT_PUBLIC_MIN_PARCEL_HA) || 0.01;
export const MAX_PARCEL_HA = Number(process.env.NEXT_PUBLIC_MAX_PREDICTION_AREA_HA) || 1000;

export function parcelGeometry(points: Position[]) {
  if (points.length < 3) return { areaM2: 0, areaHa: 0, center: [0, 0] as Position };
  const lat0 = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const scaleX = 111_320 * Math.cos(lat0 * Math.PI / 180);
  const scaleY = 110_574;
  const projected = points.map(([longitude, latitude]) => [longitude * scaleX, latitude * scaleY] as Position);
  let area2 = 0, cx = 0, cy = 0;
  projected.forEach(([x1, y1], index) => {
    const [x2, y2] = projected[(index + 1) % projected.length];
    const cross = x1 * y2 - x2 * y1;
    area2 += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
  });
  const areaM2 = Math.abs(area2) / 2;
  if (Math.abs(area2) < .001) return { areaM2: 0, areaHa: 0, center: [0, 0] as Position };
  return { areaM2, areaHa: areaM2 / 10_000, center: [cx / (3 * area2) / scaleX, cy / (3 * area2) / scaleY] as Position };
}

export function closePolygon(points: Position[]): GeoPolygon {
  const ring = points.length ? [...points, points[0]] : [];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function defaultParcel(center: Position): Position[] {
  const [longitude, latitude] = center;
  const side = Math.sqrt(DEFAULT_PARCEL_AREA);
  const dy = side / 2 / 110_574;
  const dx = side / 2 / (111_320 * Math.cos(latitude * Math.PI / 180));
  return [[longitude - dx, latitude - dy], [longitude + dx, latitude - dy], [longitude + dx, latitude + dy], [longitude - dx, latitude + dy]];
}

export function validateParcel(points: Position[]) {
  if (points.length < 3) return "Agrega al menos tres vértices para dibujar el terreno.";
  if (points.some(([longitude, latitude]) => !Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) return "Hay un punto fuera del mapa. Mueve los vértices dentro del territorio.";
  const distinct = new Set(points.map(([longitude, latitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`));
  if (distinct.size < 3) return "Se necesitan tres puntos distintos para delimitar la parcela.";
  const orientation = (a: Position, b: Position, c: Position) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const intersects = (a: Position, b: Position, c: Position, d: Position) => orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
  for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) {
    const nextI = (i + 1) % points.length, nextJ = (j + 1) % points.length;
    if (i === j || nextI === j || nextJ === i) continue;
    if (intersects(points[i], points[nextI], points[j], points[nextJ])) return "El límite se cruza consigo mismo. Mueve los puntos para dibujar una parcela simple.";
  }
  const area = parcelGeometry(points).areaHa;
  if (area < MIN_PARCEL_HA) return `La parcela es menor que ${MIN_PARCEL_HA} ha. Amplía el contorno o revisa los puntos.`;
  if (area > MAX_PARCEL_HA) return `El área aproximada supera ${MAX_PARCEL_HA.toLocaleString("es-BO")} ha. Revisa que hayas marcado solo tu terreno.`;
  return null;
}
