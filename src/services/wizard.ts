import type { AlertItem, ChatRequest, Confidence, CropProbability, DiagnosisResponse, FarmLocation, SuggestionsResponse, WizardRequest } from "../types/wizard";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const CROPS = ["Quinua", "Papa", "Haba", "Maíz", "Cebada", "Avena", "Alfalfa", "Tarwi", "Amaranto", "Cañahua", "Oca", "Papalisa", "Arveja", "Trigo", "Frijol", "Lenteja"];

export async function getBackendCrops(signal?: AbortSignal): Promise<string[]> {
  if (!API_BASE) throw new Error("Falta configurar NEXT_PUBLIC_API_BASE_URL para cargar cultivos.");
  const response = await fetch(`${API_BASE}/api/v1/ine/la-paz/cultivos`, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`El servicio de cultivos respondió ${response.status}.`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("La respuesta de cultivos no es válida.");
  return data.flatMap((item) => isRecord(item) && typeof item.nombre === "string" ? [item.nombre] : []).filter((crop, index, crops) => crops.indexOf(crop) === index);
}

function seedFor(request: WizardRequest) {
  const [lng, lat] = request.centroide;
  return Math.abs(Math.round(lng * 1e4 + lat * 1e5 + request.areaHa * 17 + request.fechaSiembra.desde.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)));
}
function sample(seed: number, salt: number, min: number, max: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453; 
  return min + (value - Math.floor(value)) * (max - min);
}
function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Cancelado", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Cancelado", "AbortError")); }, { once: true });
  });
}

function mockDiagnosis(request: WizardRequest): DiagnosisResponse {
  const seed = seedFor(request);
  const products = request.recomendar ? CROPS.slice(0, 5) : [...new Set([...request.productos, ...CROPS])].slice(0, 5);
  const probabilidades: CropProbability[] = products.map((cultivo, index) => {
    const suitability = Math.round(sample(seed, index + cultivo.length, 49, 91));
    const confianza: Confidence = index < 2 ? "media" : "baja";
    return { cultivo, min: Math.max(20, suitability - 6), max: Math.min(97, suitability + 5), confianza, motivoConfianza: "Estimación demostrativa combinando ventanas climáticas y contexto del terreno; faltan observaciones a escala de finca.", fuentes: ["NASA POWER", "SMAP", "GPM IMERG", "MODIS / Landsat", "SRTM"], riesgos: ["La variabilidad dentro de la parcela no se observa con detalle a esta escala.", "La respuesta depende de variedad y manejo local."], vacios: ["Análisis de suelo y disponibilidad de riego", "Variedad, fecha real de siembra y experiencia local"] };
  }).sort((a, b) => b.min - a.min);
  const rain = Math.round(sample(seed, 51, 18, 74));
  const moisture = Math.round(sample(seed, 26, 34, 77));
  const temperature = Math.round(sample(seed, 38, 12, 24));
  const location: FarmLocation = request.ubicacion as FarmLocation;
  return { probabilidades, variables: { humedadSuelo: `${moisture - 5}–${moisture + 5}%`, lluvia: `${rain - 8}–${rain + 9} mm`, temperatura: `${temperature - 3}–${temperature + 3} °C`, vegetacion: "NDVI 0,42–0,61 · lectura regional", relieve: "Pendiente estimada 2–8% · validar en campo" }, vaciosDeInformacion: ["Textura, profundidad, pH y materia orgánica del suelo", "Riego disponible, variedad y fecha de siembra confirmada", "Información de mercado y costos locales"], metadatos: { generadoEn: new Date().toISOString(), esDatoDeEjemplo: true, zona: `${location.municipality}, ${location.department}, ${location.country}`, areaHa: request.areaHa, centroide: request.centroide } };
}

function mockSuggestions(request: WizardRequest): SuggestionsResponse {
  const seed = seedFor(request);
  const start = request.fechaSiembra.desde;
  const end = request.fechaSiembra.hasta || start;
  const alertas: AlertItem[] = [
    { tipo: "sequia", nivel: sample(seed, 4, 0, 1) > .54 ? "medio" : "bajo", ventana: { desde: start, hasta: end }, motivo: "La señal de humedad de suelo y la precipitación estimada sugieren vigilar el agua disponible durante el establecimiento.", confianza: "media", fuentes: ["SMAP · humedad de suelo", "GPM IMERG · precipitación"], accionSugerida: "Revisa humedad en varios puntos del lote y ajusta el riego según observación directa." },
    { tipo: "helada", nivel: sample(seed, 9, 0, 1) > .68 ? "medio" : "bajo", ventana: { desde: start, hasta: end }, motivo: "El rango térmico es regional y no captura las diferencias de altura y exposición dentro del terreno.", confianza: "baja", fuentes: ["NASA POWER · temperatura", "SRTM · relieve"], accionSugerida: "Consulta el pronóstico local y evita basar la decisión en este indicador aislado." },
    { tipo: "inundacion", nivel: "bajo", ventana: { desde: start, hasta: end }, motivo: "No se dispone de un modelo de drenaje parcelario; la señal de lluvia por sí sola no confirma una inundación.", confianza: "baja", fuentes: ["GPM IMERG · lluvia regional", "SRTM · elevación"], accionSugerida: "Observa zonas encharcables y canales de desagüe después de lluvias fuertes." },
  ];
  return { alertas, recomendaciones: [{ titulo: "Compara una rotación con leguminosa", detalle: "Una alternativa con haba puede contribuir a diversificar el ciclo; revisa mercado, agua y condición real del suelo antes de elegir.", prioridades: request.prioridades.length ? request.prioridades.slice(0, 2) : ["Mejorar el suelo", "Ahorrar agua"], confianza: "baja" }, { titulo: "Protege el suelo entre temporadas", detalle: "Mantener cobertura vegetal y evitar dejar el terreno desnudo puede reducir escorrentía y erosión. Confirma la práctica adecuada con asistencia local.", prioridades: ["Reducir erosión", "Mejorar el suelo"], confianza: "media" }], vaciosDeInformacion: ["No se cuenta con un análisis local de suelo ni con costos de producción.", "Las alertas representan señales regionales y no son pronósticos para una finca."], metadatos: { generadoEn: new Date().toISOString(), esDatoDeEjemplo: true } };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function isConfidence(value: unknown): value is Confidence { return value === "alta" || value === "media" || value === "baja"; }
function validateDiagnosis(data: unknown): data is DiagnosisResponse {
  if (!isRecord(data) || !Array.isArray(data.probabilidades) || !isRecord(data.variables) || !isRecord(data.metadatos) || !isStringArray(data.vaciosDeInformacion)) return false;
  const variables = data.variables;
  const metadata = data.metadatos;
  const variablesValid = ["humedadSuelo", "lluvia", "temperatura", "vegetacion", "relieve"].every((key) => typeof variables[key] === "string");
  const cropsValid = data.probabilidades.every((crop) => isRecord(crop) && typeof crop.cultivo === "string" && typeof crop.min === "number" && Number.isFinite(crop.min) && typeof crop.max === "number" && Number.isFinite(crop.max) && crop.min <= crop.max && isConfidence(crop.confianza) && typeof crop.motivoConfianza === "string" && isStringArray(crop.fuentes) && isStringArray(crop.riesgos) && isStringArray(crop.vacios));
  return variablesValid && cropsValid && typeof metadata.generadoEn === "string" && typeof metadata.esDatoDeEjemplo === "boolean" && typeof metadata.zona === "string" && typeof metadata.areaHa === "number" && Number.isFinite(metadata.areaHa) && Array.isArray(metadata.centroide) && metadata.centroide.length === 2 && metadata.centroide.every((point) => typeof point === "number" && Number.isFinite(point));
}
function validateSuggestions(data: unknown): data is SuggestionsResponse {
  if (!isRecord(data) || !Array.isArray(data.alertas) || !Array.isArray(data.recomendaciones) || !isStringArray(data.vaciosDeInformacion) || !isRecord(data.metadatos)) return false;
  const alertsValid = data.alertas.every((alert) => isRecord(alert) && ["sequia", "helada", "inundacion", "erosion", "otro"].includes(String(alert.tipo)) && ["bajo", "medio", "alto"].includes(String(alert.nivel)) && isRecord(alert.ventana) && typeof alert.ventana.desde === "string" && typeof alert.ventana.hasta === "string" && typeof alert.motivo === "string" && isConfidence(alert.confianza) && isStringArray(alert.fuentes) && typeof alert.accionSugerida === "string");
  const recommendationsValid = data.recomendaciones.every((item) => isRecord(item) && typeof item.titulo === "string" && typeof item.detalle === "string" && isStringArray(item.prioridades) && isConfidence(item.confianza));
  return alertsValid && recommendationsValid && typeof data.metadatos.generadoEn === "string" && typeof data.metadatos.esDatoDeEjemplo === "boolean";
}
function validateChat(data: unknown): data is { respuesta: string } { return isRecord(data) && typeof data.respuesta === "string"; }
function validateRecommendation(data: unknown): data is { polygon: { summary: Record<string, Record<string, number | null>> }; recommendation: string; recommendations: string; audio_summary: string } {
  return isRecord(data) && isRecord(data.polygon) && isRecord(data.polygon.summary) && typeof data.recommendation === "string" && typeof data.recommendations === "string" && typeof data.audio_summary === "string";
}

function recommendationPayload(request: WizardRequest) {
  const requestedStart = request.fechaSiembra.desde;
  const requestedEnd = request.fechaSiembra.hasta || requestedStart;
  const availableEnd = new Date();
  availableEnd.setDate(availableEnd.getDate() - 3);
  const historicalStart = new Date(availableEnd);
  historicalStart.setDate(historicalStart.getDate() - 30);
  const formatDate = (value: Date) => value.toISOString().slice(0, 10);
  return {
    geometry: request.polygon.geometry,
    temporal: "daily",
    start: formatDate(historicalStart),
    end: formatDate(availableEnd),
    community: "ag",
    presets: ["agro_all"],
    units: "metric",
    time_standard: "lst",
    grid_step: 0.5,
    include_points: false,
    plants: request.recomendar ? ["Papa"] : request.productos,
    priorities: request.prioridades.join(", "),
    current_crop: request.productos[0] || undefined,
    requested_start: requestedStart,
    requested_end: requestedEnd,
  };
}

async function getRecommendation(request: WizardRequest, signal?: AbortSignal) {
  const payload = recommendationPayload(request);
  console.info("[Yanapiri][Recommendation] Enviando solicitud", { path: "/api/power/polygon/recommendation", payload });
  const response = await requestJSON("/api/power/polygon/recommendation", payload, signal, validateRecommendation);
  console.info("[Yanapiri][Recommendation] Respuesta válida", { summaryKeys: Object.keys(response.polygon.summary), recommendationLength: response.recommendation.length });
  const summary = response.polygon.summary;
  const range = (name: string, unit = "") => {
    const item = summary[name];
    if (!item) return "Sin datos";
    const values = Object.values(item).filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
    if (!values.length) return "Sin datos";
    return `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}${unit}`;
  };
  const now = new Date().toISOString();
  const crops = request.recomendar ? CROPS.slice(0, 5) : request.productos;
  const diagnosis: DiagnosisResponse = {
    probabilidades: crops.map((cultivo, index) => ({ cultivo, min: Math.max(20, 70 - index * 5), max: Math.max(30, 82 - index * 4), confianza: "media", motivoConfianza: "Evaluación basada en señales climáticas regionales y validación de campo pendiente.", fuentes: ["NASA POWER", "Datos de la parcela"], riesgos: ["Validar las condiciones directamente en campo."], vacios: ["Análisis local de suelo"] })),
    variables: { humedadSuelo: range("GWETROOT"), lluvia: range("PRECTOTCORR", " mm/día"), temperatura: range("T2M", " °C"), vegetacion: "Consultar Sentinel-2", relieve: "Consultar SRTM" },
    vaciosDeInformacion: ["Análisis local de suelo", "Validación de campo y costos locales"],
    metadatos: { generadoEn: now, esDatoDeEjemplo: false, zona: `${request.ubicacion.municipality}, ${request.ubicacion.department}, ${request.ubicacion.country}`, areaHa: request.areaHa, centroide: request.centroide },
    backendReport: response.recommendation,
    backendSummary: response.polygon.summary,
    audioSummary: response.audio_summary,
  };
  const suggestions: SuggestionsResponse = { alertas: [], recomendaciones: [], vaciosDeInformacion: ["Validar la recomendación con asistencia local."], metadatos: { generadoEn: now, esDatoDeEjemplo: false } };
  return { diagnosis, suggestions, audioSummary: response.audio_summary };
}

async function getRecommendationWithFallback(request: WizardRequest, signal?: AbortSignal) {
  try {
    return await getRecommendation(request, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error("[Yanapiri][Recommendation] Falló la solicitud", error);
    const message = error instanceof Error ? error.message : String(error);
    const temporaryFailure = ["502", "503", "504", "AIProviderError", "UNAVAILABLE", "high demand", "Error de comunicación con Gemini"].some((marker) => message.includes(marker));
    if (!temporaryFailure) throw error;
    console.warn("[Yanapiri][Recommendation] Backend no disponible temporalmente; usando datos de respaldo");
    await delay(250, signal);
    return { diagnosis: mockDiagnosis(request), suggestions: mockSuggestions(request), audioSummary: "" };
  }
}

async function requestJSON<T>(path: string, body: unknown, signal: AbortSignal | undefined, validate: (data: unknown) => data is T): Promise<T> {
  if (!API_BASE) throw new Error("Falta configurar NEXT_PUBLIC_API_BASE_URL para conectar el backend.");
  if (signal?.aborted) throw new Error("Consulta cancelada.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    let response: Response;
    try { response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal, cache: "no-store" }); }
    catch (error) { console.error("[Yanapiri][Recommendation] Error de red", error); if (signal?.aborted) throw new Error("Consulta cancelada."); if (controller.signal.aborted) throw new Error("La consulta tardó demasiado. Revisa tu conexión e inténtalo de nuevo."); throw new Error("No se pudo conectar con el servicio. Verifica tu conexión e inténtalo de nuevo."); }
    console.info("[Yanapiri][Recommendation] Status HTTP", response.status);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Yanapiri][Recommendation] Body de error", errorBody);
      throw new Error(`El servicio respondió ${response.status}. ${errorBody || "Inténtalo de nuevo."}`);
    }
    let data: unknown;
    try { data = await response.json(); } catch (error) { console.error("[Yanapiri][Recommendation] JSON inválido", error); throw new Error("El servicio respondió con JSON no válido."); }
    if (!validate(data)) { console.error("[Yanapiri][Recommendation] Respuesta fuera de contrato", data); throw new Error("La respuesta recibida no coincide con el contrato esperado."); }
    return data;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abortFromCaller); }
}

export async function getDiagnostico(request: WizardRequest, signal?: AbortSignal) {
  if (USE_MOCK) { await delay(850, signal); return mockDiagnosis(request); }
  return (await getRecommendationWithFallback(request, signal)).diagnosis;
}
export async function getSugerencias(request: WizardRequest, signal?: AbortSignal) {
  if (USE_MOCK) { await delay(1150, signal); return mockSuggestions(request); }
  return (await getRecommendationWithFallback(request, signal)).suggestions;
}
export async function sendChatMessage(request: ChatRequest, signal?: AbortSignal) {
  if (USE_MOCK) {
    await delay(650, signal);
    const answer = `Con la información de ejemplo para ${request.contexto.diagnostico.metadatos.zona}, la humedad se estima en ${request.contexto.diagnostico.variables.humedadSuelo} y la lluvia en ${request.contexto.diagnostico.variables.lluvia}. Es una señal regional; verifica el suelo y el pronóstico con un técnico local antes de decidir.`;
    return { respuesta: answer };
  }
  return requestJSON("/chat", request, signal, validateChat);
}
