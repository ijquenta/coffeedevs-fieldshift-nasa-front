"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { sendChatMessage } from "../../services/wizard";
import type { ChatMessage } from "../../types/wizard";
import { plantingWindow } from "../../lib/wizard-dates";
import { useWizard } from "./wizard-store";

interface RecognitionResult { results: ArrayLike<{ 0: { transcript: string } }> }
interface RecognitionError { error: string }
interface RecognitionLike { lang: string; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: RecognitionError) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type RecognitionConstructor = new () => RecognitionLike;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

export default function FieldChat() {
  const { location, polygon, products, plantingFrom, plantingTo, plantingMode, flexibleWeeks, priorities, diagnosis, suggestions, chatHistory, setChatHistory } = useWizard();
  const [open, setOpen] = useState(false), [message, setMessage] = useState(""), [sending, setSending] = useState(false), [listening, setListening] = useState(false), [error, setError] = useState(""), [retryMessage, setRetryMessage] = useState("");
  const recognition = useRef<RecognitionLike | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { recognition.current?.stop(); requestRef.current?.abort(); }, []);
  const speechApi = typeof window !== "undefined" ? (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition : undefined;
  const send = async (retry?: string) => {
    const text = (retry ?? message).trim(); if (!text || !diagnosis || !suggestions || !location || !polygon || sending) return;
    setError(""); setRetryMessage(""); setMessage(""); const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() }; const history = retry ? chatHistory : [...chatHistory, userMessage]; if (!retry) setChatHistory(history); const controller = new AbortController(); requestRef.current = controller; setSending(true);
    const ring = polygon.geometry.coordinates[0]; const points = ring.length > 1 ? ring.slice(0, -1) : ring;
    const center: [number, number] = [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
    try {
      const result = await sendChatMessage({ mensaje: text, historial: history.map(({ role, content }) => ({ role, content })), contexto: { parcela: { areaHa: diagnosis.metadatos.areaHa, centroide: center, ubicacion: { country: location.country, countryCode: location.countryCode, department: location.department, municipality: location.municipality, ...(location.pcode ? { pcode: location.pcode } : {}) }, productos: products, fechaSiembra: { tipo: plantingMode === "date" ? "fecha" : plantingMode === "range" ? "rango" : "flexible", ...plantingWindow(plantingMode, plantingFrom, plantingTo, flexibleWeeks) }, prioridades: priorities }, diagnostico: diagnosis, sugerencias: suggestions } }, controller.signal);
      if (controller.signal.aborted) return;
      setChatHistory([...history, { id: crypto.randomUUID(), role: "assistant", content: result.respuesta, createdAt: new Date().toISOString() }]);
    } catch (reason) { if (controller.signal.aborted) return; setRetryMessage(text); setError(reason instanceof Error ? reason.message : "No se pudo enviar. Inténtalo otra vez."); }
    finally { if (requestRef.current === controller) setSending(false); }
  };
  const startListening = () => {
    if (!speechApi) { setError("Este navegador no permite dictado por voz. Puedes escribir tu pregunta."); return; }
    const instance = new speechApi(); recognition.current = instance; instance.lang = "es-BO"; instance.interimResults = false;
    instance.onresult = (event) => { setMessage((current) => `${current}${current ? " " : ""}${event.results[0]?.[0]?.transcript ?? ""}`); };
    instance.onerror = (event) => { setError(event.error === "not-allowed" ? "No hay permiso para usar el micrófono. Puedes escribir tu pregunta." : "No se entendió el audio. Inténtalo de nuevo o escribe tu pregunta."); setListening(false); };
    instance.onend = () => setListening(false);
    try { instance.start(); setListening(true); setError(""); } catch { setError("El micrófono ya está activo."); }
  };
  const stopListening = () => { recognition.current?.stop(); setListening(false); };

  return <div className={`wizard-chat ${open ? "is-open" : ""}`}>
    {!open ? <button className="wizard-chat-bubble" onClick={() => setOpen(true)} aria-label="Abrir asistente de campo"><span className="wizard-chat-orbit"><Sparkles size={15} /></span><span className="wizard-chat-bubble-copy"><small>ASISTENTE DE CAMPO</small><strong>¿Hablamos de tu parcela?</strong></span><MessageCircle size={19} /></button> : <section className="wizard-chat-panel" aria-label="Asistente de campo"><div className="wizard-chat-header"><span className="wizard-chat-avatar"><Sparkles size={16} /></span><span><strong>Asistente de campo</strong><small>Respuestas basadas en este análisis</small></span><button onClick={() => setOpen(false)} aria-label="Cerrar chat"><X size={17} /></button></div>
      <div className="wizard-chat-messages" aria-live="polite">{chatHistory.length === 0 && <div className="wizard-chat-welcome"><span>✳</span><strong>Tu parcela tiene una historia.</strong><p>Pregúntame por las señales, los cultivos o las alertas del análisis.</p></div>}{chatHistory.map((item) => <div className={`wizard-chat-message ${item.role}`} key={item.id}><span>{item.role === "assistant" ? "CAMPO" : "TÚ"}</span><p>{item.content}</p></div>)}{sending && <div className="wizard-chat-typing"><LoaderCircle className="animate-spin" size={14} /> Consultando el análisis…</div>}{error && <div className="wizard-chat-error" role="alert"><p>{error}</p>{retryMessage && <button onClick={() => void send(retryMessage)}>Intentar enviar de nuevo</button>}</div>}</div>
      <div className="wizard-chat-compose">{speechApi && <button className={listening ? "listening" : ""} onClick={listening ? stopListening : startListening} aria-label={listening ? "Dejar de escuchar" : "Dictar una pregunta"}>{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>}<textarea value={message} onChange={(event) => { setMessage(event.target.value); setError(""); setRetryMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Escribe o dicta una pregunta…" rows={1} aria-label="Pregunta al asistente" /><button disabled={!message.trim() || sending} onClick={() => void send()} aria-label="Enviar pregunta"><Send size={15} /></button></div><p className="wizard-chat-footnote">{speechApi ? "El asistente puede equivocarse. Contrasta con la asesoría local." : "Este navegador no permite dictar por voz. Puedes escribir tu pregunta. Las respuestas pueden equivocarse."}</p>
    </section>}
  </div>;
}
