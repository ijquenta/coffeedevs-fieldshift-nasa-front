"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, CheckCircle2, CircleHelp, CloudRain, Droplets, Flame, Leaf, Mountain, Pause, Play, RotateCcw, Satellite, ShieldAlert, Snowflake, Sparkles, Sprout, StopCircle, Thermometer, Volume2, Waves } from "lucide-react";
import { useWizard } from "./wizard-store";
import type { WeatherScenario } from "./wizard-map";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const confidenceText = { alta: "Buena señal", media: "Señal parcial", baja: "Pocos datos" };
function leerFilaTabla(value: string, columnas: number) {
  if (!value.startsWith("|")) return null;
  let cierre = 0;
  for (let columna = 0; columna < columnas; columna += 1) {
    cierre = value.indexOf("|", cierre + 1);
    if (cierre < 0) return null;
  }
  return { fila: value.slice(0, cierre + 1).trim(), resto: value.slice(cierre + 1) };
}
function normalizarTablasMarkdown(value: string) {
  return value.split("\n").map((line) => {
    const separador = line.match(/\|(?:\s*:?-{3,}:?\s*\|)+/);
    if (!separador || separador.index === undefined) return line;
    const columnas = separador[0].split("|").length - 2;
    const antes = line.slice(0, separador.index);
    const posiciones = [...antes.matchAll(/\|/g)].map((match) => match.index ?? -1);
    const inicioCabecera = posiciones[posiciones.length - columnas - 1];
    if (inicioCabecera === undefined || columnas < 1) return line;
    const finCabecera = posiciones[posiciones.length - 1] + 1;
    const cabecera = antes.slice(inicioCabecera, finCabecera).trim();
    if (cabecera.split("|").length - 2 !== columnas) return line;

    const filas = [cabecera, separador[0].trim()];
    let resto = line.slice(separador.index + separador[0].length).trimStart();
    while (resto.startsWith("|")) {
      const resultado = leerFilaTabla(resto, columnas);
      if (!resultado) return line;
      filas.push(resultado.fila);
      resto = resultado.resto.trimStart();
    }

    const prefijo = antes.slice(0, inicioCabecera).trimEnd();
    const sufijo = resto.trim();
    return `${prefijo ? `${prefijo}\n\n` : ""}${filas.join("\n")}${sufijo ? `\n\n${sufijo}` : ""}`;
  }).join("\n");
}
function normalizarMarkdown(value: string) {
  const markdown = value.replace(/\\n/g, "\n").replace(/\s*(\*\*[A-E]\.\s)/g, "\n\n$1").trim();
  return normalizarTablasMarkdown(markdown);
}
const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => <p className="mb-3 leading-relaxed text-slate-300">{children}</p>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc pl-5">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal pl-5">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="mb-1">{children}</li>,
  table: ({ children }: { children?: ReactNode }) => <div className="overflow-x-auto"><table className="min-w-full">{children}</table></div>,
  thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => <th className="px-3 py-2 text-left font-semibold text-white">{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td className="px-3 py-2 text-slate-300">{children}</td>,
};
const summaryLabels: Record<string, [string, string]> = {
  GWETROOT: ["Humedad zona de raíces", "0–1"], GWETPROF: ["Humedad perfil del suelo", "0–1"], PRECTOTCORR: ["Precipitación", "mm/día"], T2M: ["Temperatura media", "°C"], T2M_MAX: ["Temperatura máxima", "°C"], T2M_MIN: ["Temperatura mínima", "°C"], RH2M: ["Humedad relativa", "%"], ALLSKY_SFC_SW_DWN: ["Radiación solar", "MJ/m²/día"], WS2M: ["Viento", "m/s"],
};
const scenarios: { id: WeatherScenario; label: string; icon: typeof CloudRain; color: string }[] = [
  { id: "none", label: "Actual", icon: RotateCcw, color: "neutral" },
  { id: "drought", label: "Sequía", icon: Droplets, color: "drought" },
  { id: "heavy-rain", label: "Lluvia intensa", icon: CloudRain, color: "rain" },
  { id: "heat", label: "Ola de calor", icon: Flame, color: "heat" },
  { id: "frost", label: "Helada", icon: Snowflake, color: "frost" },
];
const scenarioNames: Record<Exclude<WeatherScenario, "none">, string> = {
  drought: "Sequía",
  "heavy-rain": "Lluvia intensa",
  heat: "Ola de calor",
  frost: "Helada",
};

const cropSensitivity: Record<Exclude<WeatherScenario, "none">, Record<string, number>> = {
  drought: { papa: -12, quinua: -5, haba: -14, maiz: -16, cebada: -6, avena: -8, alfalfa: -8, tarwi: -7, amaranto: -6, canahua: -6 },
  "heavy-rain": { papa: -8, quinua: -5, haba: -8, maiz: -5, cebada: -9, avena: -6, alfalfa: -5, tarwi: -7, amaranto: -6, canahua: -5 },
  heat: { papa: -16, quinua: -8, haba: -14, maiz: -11, cebada: -11, avena: -10, alfalfa: -8, tarwi: -9, amaranto: -8, canahua: -7 },
  frost: { papa: -12, quinua: -6, haba: -14, maiz: -20, cebada: -8, avena: -8, alfalfa: -14, tarwi: -11, amaranto: -15, canahua: -7 },
};

function adjustRange(value: string, scale = 1, shift = 0, minimum = -Infinity, maximum = Infinity) {
  return value.replace(/(-?\d+(?:[.,]\d+)?)\s*[–-]\s*(-?\d+(?:[.,]\d+)?)/, (range, lowText: string, highText: string) => {
    const decimals = Math.max((lowText.split(/[.,]/)[1] ?? "").length, (highText.split(/[.,]/)[1] ?? "").length);
    const format = (number: number) => Math.min(maximum, Math.max(minimum, number)).toFixed(decimals).replace(".", ",");
    const low = Number(lowText.replace(",", "."));
    const high = Number(highText.replace(",", "."));
    return `${format(low * scale + shift)}–${format(high * scale + shift)}`;
  });
}

function simulatedDiagnosis(diagnosis: NonNullable<ReturnType<typeof useWizard>["diagnosis"]>, scenario: WeatherScenario, severity: number) {
  if (scenario === "none") return diagnosis;
  const intensity = Math.max(0, Math.min(100, severity)) / 100;
  const moistureScale = scenario === "drought" ? 1 - .34 * intensity : scenario === "heavy-rain" ? 1 + .28 * intensity : scenario === "heat" ? 1 - .18 * intensity : 1 - .08 * intensity;
  const rainScale = scenario === "drought" ? 1 - .55 * intensity : scenario === "heavy-rain" ? 1 + .7 * intensity : scenario === "heat" ? 1 - .2 * intensity : 1;
  const temperatureShift = scenario === "drought" ? 2.5 * intensity : scenario === "heavy-rain" ? -.5 * intensity : scenario === "heat" ? 5 * intensity : -5 * intensity;
  const vegetationShift = scenario === "drought" ? -.15 * intensity : scenario === "heavy-rain" ? -.04 * intensity : scenario === "heat" ? -.12 * intensity : -.18 * intensity;
  const cropShift = (crop: string) => {
    const key = crop.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (cropSensitivity[scenario][key] ?? -9) * intensity;
  };

  return {
    ...diagnosis,
    variables: {
      ...diagnosis.variables,
      humedadSuelo: adjustRange(diagnosis.variables.humedadSuelo, moistureScale, 0, 0, 100),
      lluvia: adjustRange(diagnosis.variables.lluvia, rainScale, 0, 0),
      temperatura: adjustRange(diagnosis.variables.temperatura, 1, temperatureShift),
      vegetacion: adjustRange(diagnosis.variables.vegetacion, 1, vegetationShift, 0, 1),
    },
    probabilidades: diagnosis.probabilidades.map((crop) => {
      const shift = cropShift(crop.cultivo);
      return { ...crop, min: Math.max(5, Math.min(98, Math.round(crop.min + shift))), max: Math.max(5, Math.min(98, Math.round(crop.max + shift))) };
    }).sort((a, b) => b.min - a.min),
  };
}

export default function ResultsCard({ onBack, scenario, onScenarioChange, severity, onSeverityChange }: { onBack: () => void; scenario: WeatherScenario; onScenarioChange: (scenario: WeatherScenario) => void; severity: number; onSeverityChange: (severity: number) => void }) {
  const { diagnosis, suggestions, resultTab, setResultTab } = useWizard();
  const displayedDiagnosis = useMemo(() => diagnosis ? simulatedDiagnosis(diagnosis, scenario, severity) : null, [diagnosis, scenario, severity]);
  const [speaking, setSpeaking] = useState(false), [paused, setPaused] = useState(false), [boundary, setBoundary] = useState(0);
  const narration = useMemo(() => displayedDiagnosis ? `Para ${displayedDiagnosis.metadatos.zona}, estas son posibilidades para explorar${scenario !== "none" ? ` bajo el escenario simulado de ${scenarioNames[scenario]}` : ""}. ${displayedDiagnosis.probabilidades.slice(0, 3).map((crop) => `${crop.cultivo}, entre ${crop.min} y ${crop.max} por ciento de idoneidad indicativa.`).join(" ")} Revisa las alertas de agua y temperatura, y conversa con una persona técnica local antes de tomar una decisión.` : "", [displayedDiagnosis, scenario]);
  if (!diagnosis || !suggestions) return <section className="wizard-card-body"><div className="wizard-card-kicker">03 · RESULTADOS</div><p>No hay análisis cargado.</p></section>;
  const stopSpeech = () => { window.speechSynthesis?.cancel(); setSpeaking(false); setPaused(false); setBoundary(0); };
  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    stopSpeech(); const utterance = new SpeechSynthesisUtterance(narration); utterance.lang = "es-BO"; utterance.rate = .92; utterance.onstart = () => setSpeaking(true); utterance.onboundary = (event) => setBoundary(event.charIndex); utterance.onend = stopSpeech; utterance.onerror = stopSpeech;
    const voices = window.speechSynthesis.getVoices(); utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === "es-bo") ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("es-419")) ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) ?? null;
    window.speechSynthesis.speak(utterance);
  };
  const highlightNarration = () => { const end = narration.indexOf(" ", boundary + 1); return <>{narration.slice(0, boundary)}<mark>{narration.slice(boundary, end < 0 ? narration.length : end)}</mark>{narration.slice(end < 0 ? narration.length : end)}</>; };
  return <section className="wizard-card-body wizard-results-card">
     <div className="wizard-result-heading"><div className="wizard-card-title-row"><div><h1>Tu parcela, en perspectiva.</h1><p className="wizard-card-intro">Señales para explorar escenarios posibles; no son certezas de cosecha.</p></div><button className="wizard-card-back-button" onClick={onBack} aria-label="Volver a planes"><ArrowLeft size={16} /> Atrás</button></div></div>
     <div className="wizard-result-tabs" role="tablist" aria-label="Vista del análisis"><button role="tab" aria-selected={resultTab === "diagnostico"} className={resultTab === "diagnostico" ? "active" : ""} onClick={() => setResultTab("diagnostico")}><Satellite size={14} /> Diagnóstico</button><button role="tab" aria-selected={resultTab === "sugerencias"} className={resultTab === "sugerencias" ? "active" : ""} onClick={() => setResultTab("sugerencias")}><Sparkles size={14} /> Posibles cambios <span>{suggestions.alertas.length}</span></button></div>

    {resultTab === "diagnostico" ? <div className="wizard-diagnosis-pane">
      {scenario !== "none" && <div className={`wizard-diagnosis-scenario scenario-${scenario}`} aria-live="polite"><div><span>DIAGNÓSTICO EN ESCENARIO</span><strong>{scenarioNames[scenario]}</strong></div><b>{severity}% intensidad</b><small>Rangos de señales y cultivos recalculados desde la línea base para explorar sensibilidad.</small></div>}
       <div className="wizard-probability-heading"><div><p className="wizard-sub-kicker">ESCENARIOS DE SIEMBRA</p><h2>¿Qué cultivos podrían adaptarse?</h2></div><span title="Idoneidad es una orientación estadística, no una probabilidad garantizada de cosecha."><CircleHelp size={16} /></span></div>
       {diagnosis.backendReport && <article className="wizard-backend-report"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{normalizarMarkdown(diagnosis.backendReport)}</ReactMarkdown></article>}
       <div className="wizard-probabilities">{displayedDiagnosis!.probabilidades.map((crop, index) => { const baseline = diagnosis.probabilidades.find((item) => item.cultivo === crop.cultivo); return <article className="wizard-crop-result" key={crop.cultivo}><div className="wizard-crop-result-top"><span className="wizard-crop-rank">0{index + 1}</span><strong>{crop.cultivo}</strong><span className={`wizard-confidence confidence-${crop.confianza}`}>{confidenceText[crop.confianza]}</span></div><div className="wizard-suitability"><div className="wizard-suitability-track"><i style={{ left: `${crop.min}%`, width: `${crop.max - crop.min}%` }} /></div><strong>{crop.min}–{crop.max}%</strong></div>{scenario !== "none" && baseline && <small className="wizard-scenario-baseline">Base: {baseline.min}–{baseline.max}% <span>→</span> {scenarioNames[scenario]}: {crop.min}–{crop.max}%</small>}<p>{crop.motivoConfianza}{scenario !== "none" ? ` Ajuste hipotético para ${scenarioNames[scenario]} con intensidad ${severity}%.` : ""}</p><details><summary>Fuentes, riesgos y datos por revisar</summary><div className="wizard-details-grid"><div><b>DATOS NASA</b><span>{crop.fuentes.join(" · ")}</span></div><div><b>RIESGOS</b><span>{crop.riesgos.join(" ")}</span></div><div><b>FALTA SABER</b><span>{crop.vacios.join(" · ")}</span></div></div></details></article>; })}</div>
       <div className="wizard-voice-card"><div className="wizard-voice-icon"><Volume2 size={19} /></div><div className="wizard-voice-copy"><strong>Escucha el resumen</strong><p>{speaking || paused ? highlightNarration() : "Te leemos las señales principales de tu parcela."}</p></div><div className="wizard-voice-controls"><button onClick={speaking && paused ? () => { window.speechSynthesis.resume(); setPaused(false); } : speaking ? () => { window.speechSynthesis.pause(); setPaused(true); } : speak} title={paused ? "Continuar" : speaking ? "Pausar" : "Escuchar resultados"}>{speaking && !paused ? <Pause size={15} /> : <Play size={15} />}</button>{speaking && <button onClick={stopSpeech} title="Detener"><StopCircle size={15} /></button>}</div></div>
     </div> : <div className="wizard-suggestions-pane">
       <section className="wizard-scenario-simulator" aria-label="Simulador visual de escenarios climáticos">
         <div className="wizard-scenario-heading"><div><span>EXPLORA POSIBLES CAMBIOS</span><strong>¿Y si cambia el clima?</strong><small>Observa cómo cambian las señales del diagnóstico.</small></div><b>SIMULACIÓN</b></div>
         <div className="wizard-scenario-options" role="group" aria-label="Escenario climático">{scenarios.map(({ id, label, icon: Icon, color }) => <button key={id} type="button" className={`${scenario === id ? "is-active" : ""} scenario-${color}`} onClick={() => onScenarioChange(id)} aria-pressed={scenario === id}><Icon size={14} /><span>{label}</span></button>)}</div>
         {scenario !== "none" && <label className="wizard-scenario-severity"><span>Intensidad del escenario</span><strong>{severity}%</strong><input type="range" min="25" max="100" step="5" value={severity} onChange={(event) => onSeverityChange(Number(event.target.value))} /></label>}
         <div className="wizard-variable-grid"><Variable icon={<Droplets size={16} />} label="Humedad de suelo" value={displayedDiagnosis!.variables.humedadSuelo} baseline={scenario === "none" ? undefined : diagnosis.variables.humedadSuelo} source="SMAP · señal regional" /><Variable icon={<CloudRain size={16} />} label="Lluvia estimada" value={displayedDiagnosis!.variables.lluvia} baseline={scenario === "none" ? undefined : diagnosis.variables.lluvia} source="GPM IMERG" /><Variable icon={<Thermometer size={16} />} label="Temperatura" value={displayedDiagnosis!.variables.temperatura} baseline={scenario === "none" ? undefined : diagnosis.variables.temperatura} source="NASA POWER" /><Variable icon={<Leaf size={16} />} label="Vegetación" value={displayedDiagnosis!.variables.vegetacion} source="MODIS · Landsat" /><Variable icon={<Mountain size={16} />} label="Relieve" value={displayedDiagnosis!.variables.relieve} source="SRTM · modelo del terreno" /></div>
       </section>
      <div className="wizard-alert-title"><div><p className="wizard-sub-kicker">SEÑALES PARA VIGILAR</p><h2>Prepárate con tiempo.</h2></div><span>ORIENTATIVO</span></div>
      <div className="wizard-alerts">{suggestions.alertas.map((alert, index) => <article className={`wizard-alert alert-${alert.nivel}`} key={`${alert.tipo}-${index}`}><div className="wizard-alert-icon">{alert.tipo === "sequia" ? <Droplets size={17} /> : alert.tipo === "helada" ? <Snowflake size={17} /> : alert.tipo === "inundacion" ? <Waves size={17} /> : <AlertTriangle size={17} />}</div><div className="wizard-alert-content"><div className="wizard-alert-top"><strong>{({ sequia: "Agua disponible", helada: "Temperatura y helada", inundacion: "Exceso de agua", erosion: "Erosión", otro: "Señal para revisar" })[alert.tipo]}</strong><span>{alert.nivel === "alto" ? "ALTA ATENCIÓN" : alert.nivel === "medio" ? "ATENCIÓN" : "VIGILAR"}</span></div><p>{alert.motivo}</p><small>{alert.ventana.desde} · confianza {alert.confianza} · {alert.fuentes.join(" / ")}</small><div className="wizard-alert-action"><ArrowUpRight size={14} />{alert.accionSugerida}</div></div></article>)}</div>
       {diagnosis.backendSummary && <details className="wizard-backend-summary"><summary>Variables de NASA POWER</summary><div className="wizard-power-cards">{Object.entries(diagnosis.backendSummary).map(([key, values]) => { const [label, unit] = summaryLabels[key] ?? [key, ""]; return <article className="wizard-power-card" key={key}><div className="wizard-power-card-heading"><strong>{label}</strong><code>{key}</code></div><div className="wizard-power-card-values"><span><small>Mínimo</small><b>{values.min ?? "Sin datos"}</b></span><span><small>Máximo</small><b>{values.max ?? "Sin datos"}</b></span><span><small>Promedio</small><b>{values.mean ?? "Sin datos"}</b></span></div>{unit && <em>{unit}</em>}</article>; })}</div></details>}
       <div className="wizard-unknowns"><div><ShieldAlert size={17} /><strong>Qué no sabemos todavía</strong></div><ul>{[...new Set([...diagnosis.vaciosDeInformacion, ...suggestions.vaciosDeInformacion])].map((item) => <li key={item}>{item}</li>)}</ul>{diagnosis.audioSummary && <p>{diagnosis.audioSummary}</p>}<p>Esta herramienta apoya, no reemplaza, el criterio del agricultor ni la asesoría agrícola local.</p></div>
    </div>}
    <div className="wizard-data-footer"><CheckCircle2 size={14} /> Elaborado {new Date(diagnosis.metadatos.generadoEn).toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" })} <span>·</span> Señales regionales; valida siempre en campo.</div>
  </section>;
}

function Variable({ icon, label, value, baseline, source }: { icon: ReactNode; label: string; value: string; baseline?: string; source: string }) { return <article className="wizard-variable"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong>{baseline && <em className="wizard-variable-baseline">Base: {baseline} <i>→</i> escenario</em>}<em>{source}</em></div></article>; }
