export type Position = [longitude: number, latitude: number];
export type Confidence = "alta" | "media" | "baja";
export type Priority = "Ahorrar agua" | "Mejorar el suelo" | "Reducir erosión" | "Fijar nitrógeno" | "Ingresos y mercado" | "Forraje" | "Resistir sequía" | "Resistir heladas";

export interface GeoPolygon {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Polygon"; coordinates: Position[][] };
}

export interface FarmLocation {
  country: string;
  countryCode: string;
  department: string;
  municipality: string;
  pcode?: string;
  center: Position;
}

export interface WizardRequest {
  polygon: GeoPolygon;
  areaHa: number;
  centroide: Position;
  fechaSiembra: { tipo: "fecha" | "rango" | "flexible"; desde: string; hasta: string; semanasFlexibles?: number };
  productos: string[];
  prioridades: Priority[];
  ubicacion: Omit<FarmLocation, "center">;
  recomendar: boolean;
  notas?: string;
}

export interface CropProbability {
  cultivo: string;
  min: number;
  max: number;
  confianza: Confidence;
  motivoConfianza: string;
  fuentes: string[];
  riesgos: string[];
  vacios: string[];
}

export interface DiagnosisResponse {
  probabilidades: CropProbability[];
  variables: { humedadSuelo: string; lluvia: string; temperatura: string; vegetacion: string; relieve: string };
  vaciosDeInformacion: string[];
  metadatos: { generadoEn: string; esDatoDeEjemplo: boolean; zona: string; areaHa: number; centroide: Position };
  backendReport?: string;
  backendSummary?: Record<string, Record<string, number | null>>;
  audioSummary?: string;
}

export interface AlertItem {
  tipo: "sequia" | "helada" | "inundacion" | "erosion" | "otro";
  nivel: "bajo" | "medio" | "alto";
  ventana: { desde: string; hasta: string };
  motivo: string;
  confianza: Confidence;
  fuentes: string[];
  accionSugerida: string;
}

export interface SuggestionsResponse {
  alertas: AlertItem[];
  recomendaciones: { titulo: string; detalle: string; prioridades: string[]; confianza: Confidence }[];
  vaciosDeInformacion: string[];
  metadatos: { generadoEn: string; esDatoDeEjemplo: boolean };
}

export interface ChatMessage { id: string; role: "user" | "assistant"; content: string; createdAt: string }

export interface ChatRequest {
  mensaje: string;
  historial: Pick<ChatMessage, "role" | "content">[];
  contexto: { parcela: Pick<WizardRequest, "areaHa" | "centroide" | "ubicacion" | "productos" | "fechaSiembra" | "prioridades">; diagnostico: DiagnosisResponse; sugerencias: SuggestionsResponse };
}
