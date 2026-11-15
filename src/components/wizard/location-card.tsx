"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Crosshair, LoaderCircle, MapPin, Search, Satellite, Sparkles } from "lucide-react";
import { COUNTRIES, locationService } from "../../data/wizard-locations";
import { geocode, type GeocodeResult } from "../../services/geocoding";
import type { FarmLocation } from "../../types/wizard";

export default function LocationCard({ selected, canContinue, onChoose, onContinue, onBack }: { selected: FarmLocation | null; canContinue: boolean; onChoose: (location: FarmLocation) => void; onContinue: () => void; onBack?: () => void }) {
  const [countryCode, setCountryCode] = useState("BOL");
  const [departmentCode, setDepartmentCode] = useState("");
  const [municipalityCode, setMunicipalityCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const countries = useMemo(() => COUNTRIES.map(({ name, code }) => ({ name, code })), []);
  const departments = useMemo(() => COUNTRIES.find((country) => country.code === countryCode)?.departments ?? [], [countryCode]);
  const municipalities = useMemo(() => departments.find((department) => department.pcode === departmentCode)?.municipalities ?? [], [departments, departmentCode]);
  useEffect(() => {
    const value = query.trim(); if (value.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => geocode(value, controller.signal).then(setResults).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo buscar esa ubicación."); }).finally(() => { if (!controller.signal.aborted) setSearching(false); }), 1100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const chooseMunicipality = (code: string) => { setMunicipalityCode(code); const location = locationService.resolve(countryCode, departmentCode, code); if (location) { setError(""); onChoose(location); } };
  const chooseResult = (result: GeocodeResult) => {
    onChoose({ country: result.country || "Ubicación seleccionada", countryCode: result.countryCode || "LOC", department: result.department || "Zona local", municipality: result.municipality || result.label.split(",")[0], center: result.center });
    setQuery(""); setResults([]); setSearching(false); setError("");
  };
  const locateMe = () => {
    setError("");
    if (!window.isSecureContext) { setError("Para usar tu ubicación, abre la aplicación en HTTPS o en localhost."); return; }
    if (!navigator.geolocation) { setError("Este navegador no ofrece geolocalización. Busca o elige tu municipio."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      onChoose({ country: "Ubicación actual", countryCode: "GPS", department: "Coordenadas del dispositivo", municipality: "Mi parcela", center: [position.coords.longitude, position.coords.latitude] }); setLocating(false);
    }, (reason) => { setLocating(false); setError(reason.code === reason.PERMISSION_DENIED ? "No se permitió acceder a tu ubicación. Puedes buscarla o elegir tu municipio." : reason.code === reason.TIMEOUT ? "La ubicación tardó demasiado. Inténtalo otra vez o elige tu municipio." : "No se pudo obtener la ubicación. Revisa el permiso y vuelve a intentar."); }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 });
  };

  return <section className="wizard-card-body">
    <div className="wizard-card-actions">{onBack && <button className="wizard-card-back-button" onClick={onBack} aria-label="Atrás"><ArrowLeft size={16} /> Atrás</button>}<button className="wizard-primary-button wizard-card-action-primary" disabled={Boolean(!canContinue)} onClick={onContinue}>Confirmar parcela <ArrowRight size={16} /></button></div>
    <h1>¿Dónde está tu campo?</h1>
    <p className="wizard-card-intro">Encuentra el terreno para empezar a leer su contexto desde el espacio.</p>
    <div className="wizard-location-search"><Search size={17} aria-hidden="true" /><input aria-label="Buscar calle, municipio o país" placeholder="Calle, municipio o país" value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setResults([]); setError(""); setSearching(value.trim().length >= 3); }} onKeyDown={(event) => { if (event.key === "Escape") setResults([]); }} />{searching && <LoaderCircle className="animate-spin" size={16} />}</div>
    {query.trim().length >= 3 && results.length > 0 && <ul className="wizard-geocode-results" aria-label="Resultados de búsqueda">{results.map((result, index) => <li key={`${result.center.join(":")}-${index}`}><button onClick={() => chooseResult(result)}><MapPin size={15} /><span><strong>{result.label.split(",")[0]}</strong><small>{result.label}</small></span><ArrowRight size={14} /></button></li>)}</ul>}
    <button className="wizard-location-button" onClick={locateMe} disabled={locating}>{locating ? <LoaderCircle className="animate-spin" size={16} /> : <Crosshair size={16} />} {locating ? "Buscando ubicación…" : "Usar mi ubicación"}<span>GPS</span></button>
     {!selected?.countryCode || selected.countryCode !== "GPS" ? <><div className="wizard-or"><span />o elige tu zona<span /></div>
     <label className="wizard-field"><span>País</span><select value={countryCode} onChange={(event) => { setCountryCode(event.target.value); setDepartmentCode(""); setMunicipalityCode(""); }}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
     <div className="wizard-field-row"><label className="wizard-field"><span>Departamento</span><select value={departmentCode} onChange={(event) => { setDepartmentCode(event.target.value); setMunicipalityCode(""); }}><option value="">Elige uno</option>{departments.map((department) => <option key={department.pcode} value={department.pcode}>{department.name}</option>)}</select></label><label className="wizard-field"><span>Municipio</span><select value={municipalityCode} onChange={(event) => chooseMunicipality(event.target.value)} disabled={!departmentCode}><option value="">Elige uno</option>{municipalities.map((municipality) => <option key={municipality.pcode} value={municipality.pcode}>{municipality.name}</option>)}</select></label></div></> : null}
     {error && <div className="wizard-inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
     {!selected && <p className="wizard-validation-hint" role="status">Selecciona una ubicación, usa GPS o elige un municipio para continuar.</p>}
     {selected && <div className="wizard-selected-location"><span className="wizard-selected-pin"><MapPin size={17} /></span><span><strong>{selected.municipality} · {selected.department}</strong><em>{selected.country}</em></span><Sparkles size={15} /></div>}
  </section>;
}
