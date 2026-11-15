"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Plus, Sparkles, Sprout } from "lucide-react";
import type { Priority } from "../../types/wizard";
import { useWizard } from "./wizard-store";
import { getBackendCrops } from "../../services/wizard";

export const CROP_CATALOG = ["Papa", "Quinua", "Haba", "Maíz", "Cebada", "Avena", "Alfalfa", "Tarwi", "Amaranto", "Cañahua", "Oca", "Papalisa", "Arveja", "Trigo", "Frijol", "Lenteja"];
export const PRIORITIES: Priority[] = ["Ahorrar agua", "Mejorar el suelo", "Reducir erosión", "Fijar nitrógeno", "Ingresos y mercado", "Forraje", "Resistir sequía", "Resistir heladas"];

export default function PlanCard({ onBack, onContinue, loading, showValidation }: { onBack: () => void; onContinue: () => void; loading: boolean; showValidation: boolean }) {
  const { products, setProducts, recommend, setRecommend, productQuery, setProductQuery, plantingMode, setPlantingMode, plantingFrom, setPlantingFrom, plantingTo, setPlantingTo, flexibleWeeks, setFlexibleWeeks, priorities, setPriorities, notes, setNotes } = useWizard();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [availableCrops, setAvailableCrops] = useState(CROP_CATALOG);
  useEffect(() => { const controller = new AbortController(); getBackendCrops(controller.signal).then((crops) => { if (crops.length) setAvailableCrops(crops); }).catch(() => undefined); return () => controller.abort(); }, []);
  const matches = useMemo(() => availableCrops.filter((crop) => crop.toLocaleLowerCase("es").includes(productQuery.trim().toLocaleLowerCase("es")) && !products.includes(crop)).slice(0, productQuery.trim() ? 8 : availableCrops.length), [availableCrops, productQuery, products]);
  const canUseFreeText = productQuery.trim().length > 0 && !availableCrops.some((crop) => crop.toLocaleLowerCase("es") === productQuery.trim().toLocaleLowerCase("es")) && !products.some((crop) => crop.toLocaleLowerCase("es") === productQuery.trim().toLocaleLowerCase("es"));
  const addProduct = (value: string) => { const crop = value.trim(); if (crop && !products.some((item) => item.toLocaleLowerCase("es") === crop.toLocaleLowerCase("es"))) setProducts([...products, crop]); setProductQuery(""); setSuggestionsOpen(false); setRecommend(false); };
  const togglePriority = (priority: Priority) => setPriorities(priorities.includes(priority) ? priorities.filter((value) => value !== priority) : [...priorities, priority]);
  return <section className="wizard-card-body wizard-plan-card">
     <div className="wizard-card-actions"><button className="wizard-card-back-button" onClick={onBack} aria-label="Atrás"><ArrowLeft size={16} /> Atrás</button><button className="wizard-primary-button wizard-card-action-primary" disabled={loading} onClick={onContinue}>{loading ? "Cargando…" : <>Cargar el análisis <ArrowRight size={16} /></>}</button></div>
     <h1>¿Qué planes tienes?</h1>
     <p className="wizard-card-intro">Cuéntanos qué quieres sembrar y qué te importa cuidar.</p>

     <div className="wizard-form-block"><div className="wizard-form-label"><Sprout size={15} /><span>¿Qué te gustaría cultivar?</span><small>Puedes elegir varios</small></div>
       <div className="wizard-autocomplete"><input required={!recommend} aria-required={!recommend} aria-invalid={showValidation && !recommend && products.length === 0} className={showValidation && !recommend && products.length === 0 ? "wizard-input-invalid" : ""} role="combobox" value={productQuery} onChange={(event) => { setProductQuery(event.target.value); setSuggestionsOpen(true); }} onFocus={() => setSuggestionsOpen(true)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (matches[0] && productQuery.trim().toLowerCase() === matches[0].toLowerCase()) addProduct(matches[0]); else addProduct(productQuery); } if (event.key === "Escape") setSuggestionsOpen(false); }} placeholder="Busca o escribe un cultivo…" aria-label="Cultivo a sembrar" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls="wizard-crop-options" aria-haspopup="listbox" /><button aria-label={suggestionsOpen ? "Ocultar cultivos sugeridos" : "Ver cultivos sugeridos"} aria-expanded={suggestionsOpen} onClick={() => setSuggestionsOpen(!suggestionsOpen)}><ChevronDown size={15} /></button>
       {showValidation && !recommend && products.length === 0 && <p className="wizard-input-error" role="alert">Selecciona un cultivo o activa las recomendaciones.</p>}
        {suggestionsOpen && <ul id="wizard-crop-options" role="listbox" className="wizard-crop-suggestions">
          {canUseFreeText && <li><button type="button" role="option" aria-selected="false" onClick={() => addProduct(productQuery)}><Plus size={14} />Usar “{productQuery.trim()}”<small>texto libre</small></button></li>}
          {matches.map((crop) => <li key={crop}><button type="button" role="option" aria-selected="false" onClick={() => addProduct(crop)}><Sprout size={14} />{crop}<Plus size={13} /></button></li>)}
          {matches.length === 0 && !canUseFreeText && <li className="wizard-crop-empty">Ya agregaste todos los cultivos que coinciden.</li>}
        </ul>}
      </div>
      {products.length > 0 && <div className="wizard-selected-crops">{products.map((crop) => <button key={crop} onClick={() => setProducts(products.filter((item) => item !== crop))} title={`Quitar ${crop}`}><span>{crop}</span><span aria-hidden="true">×</span></button>)}</div>}
      <button onClick={() => { setRecommend(!recommend); if (!recommend) setProducts([]); }} className={`wizard-recommend-option ${recommend ? "selected" : ""}`}><span className="wizard-checkbox">{recommend && <Check size={12} />}</span><span><strong>Quiero que me recomienden</strong><small>Explora alternativas adecuadas para mi campo</small></span><Sparkles size={16} /></button>
    </div>

    <div className="wizard-form-block"><div className="wizard-form-label"><CalendarDays size={15} /><span>¿Cuándo planeas sembrar?</span></div>
      <div className="wizard-segmented">{([["date", "Una fecha"], ["range", "Un periodo"], ["flexible", "Flexible"]] as const).map(([mode, label]) => <button key={mode} className={plantingMode === mode ? "active" : ""} onClick={() => setPlantingMode(mode)}>{label}</button>)}</div>
       {plantingMode === "range" ? <div className="wizard-date-grid"><label>Desde<input required type="date" value={plantingFrom} onChange={(event) => setPlantingFrom(event.target.value)} /></label><label>Hasta<input type="date" value={plantingTo} min={plantingFrom} onChange={(event) => setPlantingTo(event.target.value)} /></label></div> : <div className="wizard-date-grid"><label>{plantingMode === "date" ? "Fecha estimada" : "Fecha aproximada"}<input required type="date" value={plantingFrom} onChange={(event) => setPlantingFrom(event.target.value)} /></label>{plantingMode === "flexible" && <label>Flexibilidad<select value={flexibleWeeks} onChange={(event) => setFlexibleWeeks(Number(event.target.value))}><option value={1}>± 1 semana</option><option value={2}>± 2 semanas</option><option value={3}>± 3 semanas</option><option value={4}>± 4 semanas</option></select></label>}</div>}
       {!plantingFrom && <p className="wizard-validation-hint" role="status">Selecciona una fecha de siembra.</p>}
       {plantingMode === "range" && plantingTo < plantingFrom && <p className="wizard-inline-error">La fecha final debe ser posterior a la inicial.</p>}
    </div>

    <div className="wizard-form-block"><div className="wizard-form-label"><span className="wizard-priority-star">✳</span><span>¿Qué quieres priorizar?</span><small>ELIGE LO QUE TE SIRVA</small></div><div className="wizard-priority-grid">{PRIORITIES.map((priority) => <button key={priority} onClick={() => togglePriority(priority)} className={priorities.includes(priority) ? "selected" : ""}><span>{priorities.includes(priority) && <Check size={11} />}</span>{priority}</button>)}</div><label className="wizard-field wizard-notes"><span>Algo más sobre tu terreno (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={350} placeholder="Por ejemplo: riego por acequia, suelo pedregoso…" /></label></div>
    <p className="wizard-demo-note"><Sparkles size={13} /> Aún puedes cambiar estos datos cuando vuelvas atrás.</p>
  </section>;
}
