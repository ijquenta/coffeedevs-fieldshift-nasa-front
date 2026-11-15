"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ChatMessage, DiagnosisResponse, FarmLocation, GeoPolygon, Priority, SuggestionsResponse } from "../../types/wizard";

export type WizardStep = 1 | 2 | 3;
export type MapMode = "view" | "draw" | "edit";
export type PlantingMode = "date" | "range" | "flexible";

interface WizardState {
  step: WizardStep;
  setStep: (step: WizardStep) => void;
  location: FarmLocation | null;
  setLocation: (location: FarmLocation | null) => void;
  polygon: GeoPolygon | null;
  setPolygon: (polygon: GeoPolygon | null) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  products: string[];
  setProducts: (products: string[]) => void;
  recommend: boolean;
  setRecommend: (value: boolean) => void;
  productQuery: string;
  setProductQuery: (value: string) => void;
  plantingMode: PlantingMode;
  setPlantingMode: (mode: PlantingMode) => void;
  plantingFrom: string;
  setPlantingFrom: (value: string) => void;
  plantingTo: string;
  setPlantingTo: (value: string) => void;
  flexibleWeeks: number;
  setFlexibleWeeks: (value: number) => void;
  priorities: Priority[];
  setPriorities: (values: Priority[]) => void;
  notes: string;
  setNotes: (value: string) => void;
  diagnosis: DiagnosisResponse | null;
  setDiagnosis: (value: DiagnosisResponse | null) => void;
  suggestions: SuggestionsResponse | null;
  setSuggestions: (value: SuggestionsResponse | null) => void;
  resultTab: "diagnostico" | "sugerencias";
  setResultTab: (tab: "diagnostico" | "sugerencias") => void;
  chatHistory: ChatMessage[];
  setChatHistory: (items: ChatMessage[]) => void;
}

const WizardContext = createContext<WizardState | null>(null);
export function WizardProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [location, setLocation] = useState<FarmLocation | null>(null);
  const [polygon, setPolygon] = useState<GeoPolygon | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("view");
  const [products, setProducts] = useState<string[]>([]);
  const [recommend, setRecommend] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [plantingMode, setPlantingMode] = useState<PlantingMode>("date");
  const [plantingFrom, setPlantingFrom] = useState("");
  const [plantingTo, setPlantingTo] = useState("");
  const [flexibleWeeks, setFlexibleWeeks] = useState(2);
  const [priorities, setPriorities] = useState<Priority[]>(["Ahorrar agua", "Mejorar el suelo"]);
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const [resultTab, setResultTab] = useState<"diagnostico" | "sugerencias">("diagnostico");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const value: WizardState = { step, setStep, location, setLocation, polygon, setPolygon, mapMode, setMapMode, products, setProducts, recommend, setRecommend, productQuery, setProductQuery, plantingMode, setPlantingMode, plantingFrom, setPlantingFrom, plantingTo, setPlantingTo, flexibleWeeks, setFlexibleWeeks, priorities, setPriorities, notes, setNotes, diagnosis, setDiagnosis, suggestions, setSuggestions, resultTab, setResultTab, chatHistory, setChatHistory };
  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard() {
  const state = useContext(WizardContext);
  if (!state) throw new Error("useWizard debe usarse dentro de WizardProvider.");
  return state;
}
