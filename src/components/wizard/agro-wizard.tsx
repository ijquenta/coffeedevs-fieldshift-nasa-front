"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp, Info, LoaderCircle, MapPin, Minus, Plus, RotateCcw, Ruler, Satellite, Sparkles, X } from "lucide-react";
import WizardHeader from "./wizard-header";
import LocationCard from "./location-card";
import PlanCard from "./plan-card";
import ResultsCard from "./results-card";
import FieldChat from "./field-chat";
import WizardMap, { type WeatherScenario } from "./wizard-map";
import { WizardProvider, useWizard, type MapMode } from "./wizard-store";
import { closePolygon, defaultParcel, MAX_PARCEL_HA, parcelGeometry, validateParcel } from "../../lib/wizard-geometry";
import { plantingWindow } from "../../lib/wizard-dates";
import { getDiagnostico, getSugerencias } from "../../services/wizard";
import type { FarmLocation, Position, WizardRequest } from "../../types/wizard";

const ClientWizardMap = dynamic(() => import("./wizard-map"), { ssr: false });

function polygonPoints(polygon: ReturnType<typeof closePolygon> | null) {
  if (!polygon) return [];
  const ring = polygon.geometry.coordinates[0];
  return ring.length > 1 ? ring.slice(0, -1) : ring;
}

function WizardContent() {
  const state = useWizard();
  const { step, setStep, location, setLocation, polygon, setPolygon, mapMode, setMapMode, products, recommend, plantingMode, plantingFrom, setPlantingFrom, plantingTo, setPlantingTo, flexibleWeeks, priorities, notes, diagnosis, setDiagnosis, suggestions, setSuggestions, setResultTab } = state;
  const [cameraTarget, setCameraTarget] = useState<{ position: Position; altitude: number; key: string } | null>(null);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [loading, setLoading] = useState(false), [pageError, setPageError] = useState("");
  const [showPlanValidation, setShowPlanValidation] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [weatherScenario, setWeatherScenario] = useState<WeatherScenario>("none");
  const [scenarioSeverity, setScenarioSeverity] = useState(65);
  const abortRef = useRef<AbortController | null>(null);
  const points = useMemo(() => polygonPoints(polygon), [polygon]);
  const geometry = useMemo(() => parcelGeometry(points), [points]);
  const parcelError = useMemo(() => validateParcel(points), [points]);
  const dateError = !plantingFrom || (plantingMode === "range" && (!plantingTo || plantingTo < plantingFrom));
  const productError = !recommend && products.length === 0;
  useEffect(() => () => abortRef.current?.abort(), []);

  const chooseLocation = useCallback((next: FarmLocation) => {
    setLocation(next);
    setCameraMoving(true);
    if (!plantingFrom) {
      const from = new Date();
      const to = new Date(from);
      to.setMonth(to.getMonth() + 3);
      setPlantingFrom(new Date(from.getTime() - from.getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
      setPlantingTo(new Date(to.getTime() - to.getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
    }
    setPolygon(closePolygon(defaultParcel(next.center)));
    setMapMode("edit");
    setCameraTarget({ position: next.center, altitude: 5200, key: `${next.center.join("-")}-${Date.now()}` });
    setDiagnosis(null); setSuggestions(null); setPageError("");
  }, [plantingFrom, setDiagnosis, setLocation, setMapMode, setPlantingFrom, setPlantingTo, setPolygon, setSuggestions]);

  const goToPlans = () => {
    if (!location) { setPageError("Elige dónde está tu parcela para continuar."); return; }
    if (parcelError) { setPageError(parcelError); return; }
    setPageError(""); setMapMode("view"); setStep(2);
  };

  const scaleParcel = (factor: number) => {
    if (points.length < 3) return;
    const [cx, cy] = geometry.center;
    setPolygon(closePolygon(points.map(([lng, lat]) => [cx + (lng - cx) * factor, cy + (lat - cy) * factor])));
  };

  const createRequest = (): WizardRequest | null => {
    if (!location || points.length < 3) return null;
    const { center, areaHa } = parcelGeometry(points);
    return { polygon: closePolygon(points), areaHa, centroide: center, fechaSiembra: { tipo: plantingMode === "date" ? "fecha" : plantingMode === "range" ? "rango" : "flexible", ...plantingWindow(plantingMode, plantingFrom, plantingTo, flexibleWeeks), ...(plantingMode === "flexible" ? { semanasFlexibles: flexibleWeeks } : {}) }, productos: products, prioridades: priorities, ubicacion: { country: location.country, countryCode: location.countryCode, department: location.department, municipality: location.municipality, ...(location.pcode ? { pcode: location.pcode } : {}) }, recomendar: recommend, ...(notes.trim() ? { notas: notes.trim() } : {}) };
  };

  const loadAnalysis = async () => {
    console.info("[Yanapiri][Wizard] Iniciando análisis del paso 3");
    if (parcelError) { setPageError(parcelError); return; }
     if (productError) { setShowPlanValidation(true); return; }
    if (dateError) { setPageError("Revisa el periodo de siembra: la fecha final debe ser igual o posterior a la inicial."); return; }
    const request = createRequest(); if (!request) { setPageError("Selecciona una ubicación y delimita tu parcela antes de continuar."); return; }
    console.info("[Yanapiri][Wizard] Solicitud preparada", request);
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    setPageError(""); setLoading(true); setDiagnosis(null); setSuggestions(null); setResultTab("diagnostico"); setStep(3); setMapMode("view");
    try {
      const diagnostic = await getDiagnostico(request, controller.signal);
      const advice = await getSugerencias(request, controller.signal);
      if (controller.signal.aborted) return;
      setDiagnosis(diagnostic); setSuggestions(advice); setPageError("");
    } catch (reason) {
      if (controller.signal.aborted) return;
      console.error("[Yanapiri][Wizard] Error cargando análisis", reason);
      setPageError(reason instanceof Error ? reason.message : "No se pudo cargar el análisis."); setStep(2);
    } finally { if (abortRef.current === controller) setLoading(false); }
  };

  const editMap = (mode: MapMode) => { setMapMode(mode); if (mode === "draw") setPolygon(null); };
  const locationLabel = location ? `${location.municipality} · ${location.department}, ${location.country}` : "Elige una ubicación para comenzar";

  return <main className="wizard-app">
    <WizardHeader />
    <div className="wizard-main">
      <div className="wizard-page-intro"><div /></div>

      <div className={`wizard-workspace ${step === 3 ? "wizard-workspace-results" : ""}`}>
        <section className="wizard-map-column">
          <div className="wizard-map-card">
             <div className="wizard-map-toolbar wizard-map-toolbar-empty"><div className="wizard-map-heading" />
               <div className="wizard-map-tools">
                 {(step === 1 || step === 2) && <><button onClick={() => editMap("draw")} className={mapMode === "draw" ? "active" : ""} disabled={Boolean(step === 1 && !location)} title="Dibujar un nuevo límite"><span>＋</span><small>Dibujar</small></button><button onClick={() => editMap("edit")} className={mapMode === "edit" ? "active" : ""} disabled={Boolean(points.length < 3)} title="Editar los vértices"><Ruler size={14} /><small>Editar</small></button>{mapMode !== "view" && <button onClick={() => setMapMode("view")} title="Terminar edición"><Check size={14} /><small>Listo</small></button>}{points.length > 0 && <button onClick={() => { setPolygon(null); setMapMode("draw"); }} title="Borrar el límite"><RotateCcw size={14} /><small>Borrar</small></button>}</>}
              </div>
            </div>
            <div className="wizard-map-stage">
                <ClientWizardMap points={points} mode={mapMode} cameraTarget={cameraTarget} spin={!location} scenario={step === 3 ? weatherScenario : "none"} severity={scenarioSeverity} onCameraMove={setCameraMoving} onChange={(next) => { setPolygon(next.length ? closePolygon(next) : null); setPageError(""); }} />
              <div className="wizard-map-top-hud"><span><i /> GLOBO DE LA TIERRA · CESIUM</span></div>
              {points.length >= 3 && <div className="wizard-map-measure"><span><small>SUPERFICIE DEL TERRENO</small><strong>{geometry.areaHa.toLocaleString("es-BO", { maximumFractionDigits: 2 })} <em>ha</em></strong><i>{geometry.areaHa < 100 ? `${Math.round(geometry.areaHa * 10_000).toLocaleString("es-BO")} m²` : `${(geometry.areaHa / 100).toFixed(2)} km²`}</i></span><span className="wizard-measure-divider" /><span><small>CENTRO APROXIMADO</small><strong className="wizard-coordinate">{Math.abs(geometry.center[1]).toFixed(4)}° S <i>·</i> {Math.abs(geometry.center[0]).toFixed(4)}° O</strong><i>{points.length} vértices</i></span></div>}
              {location && mapMode === "draw" && <div className="wizard-map-instruction"><Sparkles size={13} /> Haz clic en el mapa para marcar cada esquina del campo. Pulsa <kbd>Listo</kbd> al terminar.</div>}
              {location && mapMode === "edit" && <div className="wizard-map-instruction"><Ruler size={13} /> Arrastra los puntos blancos para moverlos · los puntos ámbar añaden un vértice · clic derecho elimina.</div>}
              {step === 2 && points.length >= 3 && <div className="wizard-map-scale"><span>AJUSTA EL CONTORNO</span><button onClick={() => scaleParcel(.9)} aria-label="Reducir el tamaño del polígono"><Minus size={14} /></button><button onClick={() => scaleParcel(1.1)} aria-label="Aumentar el tamaño del polígono"><Plus size={14} /></button></div>}
              {step === 3 && diagnosis && suggestions && <FieldChat />}
              <div className="wizard-map-attribution">© Cesium · NASA Earth observations · OpenStreetMap</div>
            </div>
             <div className={`wizard-map-status ${parcelError && points.length ? "has-error" : ""}`}><span>{parcelError ? <><AlertCircle size={15} />{parcelError}</> : points.length < 3 ? <>Dibuja el contorno de tu terreno sobre el globo</> : null}</span><small>Max. {MAX_PARCEL_HA.toLocaleString("es-BO")} ha</small></div>
          </div>

          {step === 1 && <div className="wizard-map-hint"><span><CircleHelp size={15} /></span><p>Al elegir una ubicación marcamos una parcela de referencia de <strong>1,2 ha</strong>. Puedes ajustarla o dibujar tu terreno encima del mapa.</p></div>}
           {step === 3 && <button className="wizard-privacy-trigger" onClick={() => setPrivacyOpen(true)}><Info size={16} /> Ver aviso importante</button>}
        </section>

        <aside className={`wizard-side-card ${step === 3 ? "results-side-card" : ""}`}>
           {step === 1 && <><LocationCard selected={location} canContinue={Boolean(location) && !parcelError && !cameraMoving} onChoose={chooseLocation} onContinue={goToPlans} onBack={undefined} />{pageError && <div className="wizard-form-error" role="alert"><AlertCircle size={16} />{pageError}</div>}</>}
           {step === 2 && <><PlanCard onBack={() => { setStep(1); setMapMode("view"); }} onContinue={() => void loadAnalysis()} loading={loading} showValidation={showPlanValidation} />{pageError && <div className="wizard-form-error" role="alert"><AlertCircle size={16} />{pageError}</div>}</>}
           {step === 3 && (loading || !diagnosis || !suggestions ? <ResultsSkeleton /> : <ResultsCard onBack={() => { setStep(2); setMapMode("view"); }} scenario={weatherScenario} onScenarioChange={setWeatherScenario} severity={scenarioSeverity} onSeverityChange={setScenarioSeverity} />)}
        </aside>
      </div>

      {privacyOpen && <div className="wizard-privacy-backdrop" onClick={() => setPrivacyOpen(false)}><aside className="wizard-privacy-popup" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onClick={(event) => event.stopPropagation()}><button className="wizard-privacy-close" onClick={() => setPrivacyOpen(false)} aria-label="Cerrar aviso"><X size={18} /></button><div className="wizard-privacy-icon"><Info size={20} /></div><h2 id="privacy-title">Aviso importante</h2><p><strong>La recomendación no es una certeza.</strong> Usa las señales como una guía de conversación con tu técnico agrícola y tus conocimientos del terreno.</p><button className="wizard-primary-button" onClick={() => setPrivacyOpen(false)}>Entendido</button></aside></div>}

           {step === 1 && <div className="wizard-bottom-context"><span><i>✳</i><strong>La primera decisión es mirar.</strong></span><p>Al elegir una ubicación, el mapa propone un contorno editable. Ajusta sus vértices a tu terreno antes de confirmar.</p></div>}
    </div>
  </main>;
}

function ResultsSkeleton() {
  return <section className="wizard-card-body"><h1>Estamos leyendo tu parcela…</h1><p className="wizard-card-intro">Combinamos las señales disponibles con tus planes de siembra.</p><div className="wizard-loading-earth"><div className="wizard-loading-orbit" /><div className="wizard-loading-sphere"><span>◌</span></div><small>CONSULTANDO DATOS DE LA TIERRA</small></div><div className="wizard-skeleton-lines"><i /><i /><i /><i /></div><div className="wizard-skeleton-results">{[0, 1, 2].map((item) => <span key={item}><i /><b /><small /></span>)}</div><p className="wizard-demo-note"><LoaderCircle className="animate-spin" size={13} /> Un momento, preparando el análisis…</p></section>;
}

function ShieldIcon() { return <span className="wizard-shield-icon"><CheckCircle2 size={16} /></span>; }

export default function AgroWizard() { return <WizardProvider><WizardContent /></WizardProvider>; }
