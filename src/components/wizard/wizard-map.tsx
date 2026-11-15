"use client";

import { useEffect, useRef, useState } from "react";
import { CloudRain, Droplets, Leaf, Thermometer, Waves } from "lucide-react";
import type { Position } from "../../types/wizard";
import type { MapMode } from "./wizard-store";

export type WeatherScenario = "none" | "drought" | "heavy-rain" | "heat" | "frost";

function isInsidePolygon(lng: number, lat: number, points: Position[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    const crosses = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

interface Props { points: Position[]; mode: MapMode; cameraTarget: { position: Position; altitude?: number; key: string } | null; spin: boolean; scenario: WeatherScenario; severity: number; onChange: (points: Position[]) => void; onCameraMove?: (moving: boolean) => void }

type WeatherLayerId = "rain" | "temperature" | "soil" | "vegetation";

const WEATHER_LAYERS: Record<WeatherLayerId, { label: string; source: string; product: string; cadence: string; icon: typeof CloudRain }> = {
  rain: { label: "Lluvia", source: "NASA GPM IMERG", product: "IMERG_Precipitation_Rate_30min", cadence: "cada 30 min", icon: CloudRain },
  temperature: { label: "Temperatura", source: "NASA AIRS · Aqua", product: "AIRS_L2_Surface_Air_Temperature_Day", cadence: "diaria", icon: Thermometer },
  soil: { label: "Humedad del suelo", source: "NASA SMAP L4", product: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", cadence: "diaria", icon: Waves },
  vegetation: { label: "Vegetación", source: "NASA VIIRS NOAA-21", product: "VIIRS_NOAA21_NDVI_8Day", cadence: "cada 8 días", icon: Leaf },
};

export default function WizardMap({ points, mode, cameraTarget, spin, scenario, severity, onChange, onCameraMove }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const cesiumRef = useRef<typeof import("cesium") | null>(null);
  const handlerRef = useRef<import("cesium").ScreenSpaceEventHandler | null>(null);
  const rainLayerRef = useRef<import("cesium").ImageryLayer | null>(null);
  const pointsRef = useRef(points), modeRef = useRef(mode), onChangeRef = useRef(onChange);
  const dragging = useRef<{ index: number } | { original: Position[]; origin: Position } | null>(null);
  const userInputUntil = useRef(0);
  const [ready, setReady] = useState(false);
  const [rainEnabled, setRainEnabled] = useState(true);
  const [weatherLayer, setWeatherLayer] = useState<WeatherLayerId>("rain");
  const [refreshKey, setRefreshKey] = useState(0);
  const [impactNote, setImpactNote] = useState<string | null>(null);
  const rainEnabledRef = useRef(rainEnabled);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => { rainEnabledRef.current = rainEnabled; }, [rainEnabled]);

  useEffect(() => { pointsRef.current = points; modeRef.current = mode; onChangeRef.current = onChange; }, [points, mode, onChange]);
  useEffect(() => { setImpactNote(null); }, [scenario, points]);

  useEffect(() => {
    let disposed = false;
    const start = async () => {
      (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
      const Cesium = await import("cesium");
      if (disposed || !host.current) return;
      const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (token) Cesium.Ion.defaultAccessToken = token;
      const viewer = new Cesium.Viewer(host.current, { animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(), requestRenderMode: true, maximumRenderTimeChange: Infinity });
      viewerRef.current = viewer; cesiumRef.current = Cesium;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 18_000_000;
      viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(-63.5, -17.5, 6_000_000), duration: 1.1 });
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas); handlerRef.current = handler;
      const positionAt = (screen: import("cesium").Cartesian2): Position | null => {
        const hit = viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid);
        if (!hit) return null;
        const cartographic = Cesium.Cartographic.fromCartesian(hit);
        return [Cesium.Math.toDegrees(cartographic.longitude), Cesium.Math.toDegrees(cartographic.latitude)];
      };
      handler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
        const picked = viewer.scene.pick(event.position)?.id as import("cesium").Entity | undefined;
        const id = typeof picked?.id === "string" ? picked.id : "";
        if (id.startsWith("scenario-impact-")) {
          setImpactNote(picked?.name ?? "Zona de revisión simulada");
          return;
        }
        setImpactNote(null);
        if (modeRef.current !== "draw") return;
        const point = positionAt(event.position); if (point) onChangeRef.current([...pointsRef.current, point]);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
        if (modeRef.current !== "edit") return;
        const picked = viewer.scene.pick(event.position)?.id as import("cesium").Entity | undefined;
        const id = typeof picked?.id === "string" ? picked.id : "";
        const anchor = positionAt(event.position); if (!anchor) return;
        if (id.startsWith("wizard-mid-")) {
          const index = Number(id.slice(11)); const next = [...pointsRef.current]; next.splice(index + 1, 0, anchor); onChangeRef.current(next); dragging.current = { index: index + 1 };
        } else if (id.startsWith("wizard-vertex-")) dragging.current = { index: Number(id.slice(14)) };
        else if (id === "wizard-parcel") dragging.current = { original: pointsRef.current.map((point) => [...point] as Position), origin: anchor };
        if (dragging.current) viewer.scene.screenSpaceCameraController.enableRotate = false;
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
      handler.setInputAction((event: { endPosition: import("cesium").Cartesian2 }) => {
        const drag = dragging.current, target = positionAt(event.endPosition); if (!drag || !target) return;
        if ("index" in drag) { const next = [...pointsRef.current]; if (next[drag.index]) next[drag.index] = target; onChangeRef.current(next); }
        else { const deltaLng = target[0] - drag.origin[0], deltaLat = target[1] - drag.origin[1]; onChangeRef.current(drag.original.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat])); }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      handler.setInputAction(() => { dragging.current = null; viewer.scene.screenSpaceCameraController.enableRotate = true; }, Cesium.ScreenSpaceEventType.LEFT_UP);
      handler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
        if (modeRef.current !== "edit" || pointsRef.current.length <= 3) return;
        const picked = viewer.scene.pick(event.position)?.id as import("cesium").Entity | undefined;
        const id = typeof picked?.id === "string" ? picked.id : "";
        if (id.startsWith("wizard-vertex-")) { const next = [...pointsRef.current]; next.splice(Number(id.slice(14)), 1); onChangeRef.current(next); }
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
      setReady(true);
    };
    start().catch((error) => console.error("No se pudo iniciar Cesium", error));
    return () => { disposed = true; handlerRef.current?.destroy(); handlerRef.current = null; if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.destroy(); viewerRef.current = null; cesiumRef.current = null; };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current, Cesium = cesiumRef.current;
    if (!ready || !viewer || !Cesium || !spin) return;
    const canvas = viewer.scene.canvas;
    const pauseForInteraction = () => { userInputUntil.current = Date.now() + 3500; };
    canvas.addEventListener("pointerdown", pauseForInteraction);
    canvas.addEventListener("wheel", pauseForInteraction);
    const timer = window.setInterval(() => {
      if (viewer.isDestroyed() || Date.now() < userInputUntil.current) return;
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.00012);
      viewer.scene.requestRender();
    }, 80);
    return () => { window.clearInterval(timer); canvas.removeEventListener("pointerdown", pauseForInteraction); canvas.removeEventListener("wheel", pauseForInteraction); };
  }, [ready, spin]);

  useEffect(() => {
    if (!ready || !cameraTarget) return;
    const Cesium = cesiumRef.current, viewer = viewerRef.current; if (!Cesium || !viewer || viewer.isDestroyed()) return;
    const stopMoving = () => onCameraMove?.(false);
    viewer.camera.moveEnd.addEventListener(stopMoving);
    onCameraMove?.(true);
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(cameraTarget.position[0], cameraTarget.position[1], cameraTarget.altitude ?? 4200), duration: 1.6, complete: stopMoving, cancel: stopMoving });
    return () => { viewer.camera.moveEnd.removeEventListener(stopMoving); };
  }, [cameraTarget, ready, onCameraMove]);

  useEffect(() => {
    const Cesium = cesiumRef.current, viewer = viewerRef.current; if (!ready || !Cesium || !viewer || viewer.isDestroyed()) return;
    for (const entity of viewer.entities.values.filter((item) => typeof item.id === "string" && (item.id.startsWith("wizard-") || item.id.startsWith("scenario-impact-")))) viewer.entities.remove(entity);
    if (points.length >= 3) {
      const scenarioColor = scenario === "drought" ? "#f2a93b" : scenario === "heavy-rain" ? "#29b8e8" : scenario === "heat" ? "#f06445" : scenario === "frost" ? "#8bd8f5" : "#ff7881";
      const parcelColor = Cesium.Color.fromCssColorString(scenarioColor);
      const parcelAlpha = scenario === "none" ? .12 : .14 + Math.max(0, Math.min(100, severity)) / 100 * .12;
      const positions = points.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(lng, lat, 14));
      viewer.entities.add({ id: "wizard-parcel", polygon: { hierarchy: positions, material: parcelColor.withAlpha(parcelAlpha), outline: true, outlineColor: parcelColor, outlineWidth: 3, perPositionHeight: false }, polyline: { positions: [...positions, positions[0]], width: 3, material: parcelColor, clampToGround: true } });
      points.forEach(([lng, lat], index) => viewer.entities.add({ id: `wizard-vertex-${index}`, position: Cesium.Cartesian3.fromDegrees(lng, lat, 25), point: { pixelSize: mode === "edit" ? 13 : 9, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString("#e64b55"), outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      if (mode === "edit") points.forEach(([lng, lat], index) => { const next = points[(index + 1) % points.length]; const midLng = (lng + next[0]) / 2, midLat = (lat + next[1]) / 2; viewer.entities.add({ id: `wizard-mid-${index}`, position: Cesium.Cartesian3.fromDegrees(midLng, midLat, 25), point: { pixelSize: 8, color: Cesium.Color.fromCssColorString("#ffca82"), outlineColor: Cesium.Color.fromCssColorString("#572c20"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } }); });
    }
    viewer.scene.requestRender();
  }, [mode, points, ready, scenario, severity]);

  useEffect(() => {
    const Cesium = cesiumRef.current, viewer = viewerRef.current;
    if (!ready || !Cesium || !viewer || viewer.isDestroyed()) return;

    // NASA GIBS serves the georeferenced satellite/model products directly as WMS imagery.
    const selectedLayer = WEATHER_LAYERS[weatherLayer];
    const provider = new Cesium.WebMapServiceImageryProvider({
      url: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
      layers: selectedLayer.product,
      parameters: { format: "image/png", transparent: true, time: "default", cacheBust: refreshKey },
      srs: "EPSG:4326",
      credit: `${selectedLayer.source} · NASA GIBS`,
    });
    const imageryLayer = viewer.imageryLayers.addImageryProvider(provider);
    // IMERG is a regional ~10 km grid; fade it as the camera approaches field scale.
    const updateLayerAlpha = () => {
      const altitude = Math.max(1, viewer.camera.positionCartographic.height);
      const regionalScale = Cesium.Math.clamp((Math.log10(altitude) - 3.5) / 1.7, 0, 1);
      imageryLayer.alpha = .12 + regionalScale * .46;
      viewer.scene.requestRender();
    };
    viewer.camera.changed.addEventListener(updateLayerAlpha);
    updateLayerAlpha();
    imageryLayer.show = rainEnabledRef.current;
    rainLayerRef.current = imageryLayer;
    viewer.scene.requestRender();

    return () => {
      viewer.camera.changed.removeEventListener(updateLayerAlpha);
      if (!viewer.isDestroyed()) viewer.imageryLayers.remove(imageryLayer, true);
      if (rainLayerRef.current === imageryLayer) rainLayerRef.current = null;
    };
  }, [ready, cameraTarget, weatherLayer, refreshKey]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    if (rainLayerRef.current) rainLayerRef.current.show = rainEnabled;
    viewer.scene.requestRender();
  }, [rainEnabled, ready]);

  useEffect(() => {
    const Cesium = cesiumRef.current, viewer = viewerRef.current;
    if (!ready || !Cesium || !viewer || viewer.isDestroyed()) return;
    for (const entity of viewer.entities.values.filter((item) => typeof item.id === "string" && item.id.startsWith("scenario-impact-"))) viewer.entities.remove(entity);
    if (scenario === "none" || points.length < 3) return;
    const color = scenario === "drought" ? "#f2a93b"
      : scenario === "heavy-rain" ? "#29b8e8"
        : scenario === "heat" ? "#f06445"
          : scenario === "frost" ? "#8bd8f5" : "#e64b55";
    // Generate a stable, illustrative pattern of review zones strictly inside the parcel.
    // These are not satellite measurements; actual environmental raster data belongs here later.
    const west = Math.min(...points.map(([lng]) => lng)), east = Math.max(...points.map(([lng]) => lng));
    const south = Math.min(...points.map(([, lat]) => lat)), north = Math.max(...points.map(([, lat]) => lat));
    const seeds: Position[] = [];
    const cols = 9, rows = 9;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const lng = west + (col + .5) / cols * (east - west), lat = south + (row + .5) / rows * (north - south);
      if (isInsidePolygon(lng, lat, points)) seeds.push([lng, lat]);
    }
    // Avoid a dense carpet of dots for tiny parcels while keeping distinct zones visible.
    const sampleCount = Math.min(7, seeds.length);
    const sample = sampleCount ? Array.from({ length: sampleCount }, (_, index) => seeds[Math.floor(index * (seeds.length - 1) / Math.max(1, sampleCount - 1))]) : [];
    const baseColor = Cesium.Color.fromCssColorString(color);
    const strength = Cesium.Math.clamp(severity / 100, .25, 1);
    const impactLabel = scenario === "drought" ? "Revisar humedad" : scenario === "heavy-rain" ? "Revisar escorrentía" : scenario === "heat" ? "Revisar estrés térmico" : "Revisar riesgo de helada";
    sample.forEach(([lng, lat], index) => {
      // Mild deterministic variation makes the map communicate relative attention, not uniformity.
      const variation = .55 + (((index * 37 + Math.round(Math.abs(lng * 1e4 + lat * 1e5))) % 43) / 100);
      const risk = Cesium.Math.clamp(strength * variation, 0, 1);
      const markerColor = risk > .78 ? Cesium.Color.fromCssColorString("#ff745f") : risk > .56 ? baseColor : Cesium.Color.fromCssColorString("#d9ef9a");
      const pointSize = 12 + Math.round(risk * 10);
      const riskClass = risk > .78 ? "Prioridad alta" : risk > .56 ? "Prioridad media" : "Prioridad de seguimiento";
      viewer.entities.add({
        id: `scenario-impact-${index}`,
        name: `${impactLabel} · ${riskClass.toLowerCase()}`,
        description: `Zona ilustrativa con ${riskClass.toLowerCase()}. Úsala como guía para decidir dónde inspeccionar; no es una medición satelital ni una observación de campo.`,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 35),
        point: { pixelSize: pointSize, color: markerColor.withAlpha(.9), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: index === 0 ? impactLabel : riskClass.replace("Prioridad ", ""), font: "10px Arial", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString("#07131c"), outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20), scale: .82, showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("#07131c").withAlpha(.82), backgroundPadding: new Cesium.Cartesian2(5, 3), disableDepthTestDistance: Number.POSITIVE_INFINITY, show: sampleCount <= 4 || index === 0 },
      });
    });
    viewer.scene.requestRender();
  }, [scenario, severity, ready, points]);

  useEffect(() => {
    const interval = WEATHER_LAYERS[weatherLayer].cadence === "cada 30 min" ? 30 * 60_000 : 6 * 60 * 60_000;
    const timer = window.setInterval(() => setRefreshKey((current) => current + 1), interval);
    return () => window.clearInterval(timer);
  }, [weatherLayer]);
  const selectedWeatherLayer = WEATHER_LAYERS[weatherLayer];
  const WeatherIcon = selectedWeatherLayer.icon;

  return <>
     <div ref={host} className="wizard-cesium" aria-label="Globo 3D interactivo para ubicar y editar la parcela" />
     {!mounted ? null : <>
    {impactNote && <div className="wizard-impact-note" role="status"><strong>{impactNote}</strong><span>Zona ilustrativa: inspecciona el suelo y contrasta con condiciones observadas en el lote.</span><button type="button" onClick={() => setImpactNote(null)} aria-label="Cerrar nota">×</button></div>}
    {scenario !== "none" && <div className={`wizard-scenario-map-key scenario-key-${scenario}`} aria-live="polite">
      <strong>ZONAS DE REVISIÓN · DEMO</strong>
      <span><i className="impact-high" />Mayor atención</span>
      <span><i className="impact-mid" />Atención media</span>
      <small>Selecciona un punto para ver su nota.</small>
    </div>}
    <div className="wizard-rain-control" aria-label="Capas de observación de NASA">
      <button type="button" className={`wizard-rain-toggle ${rainEnabled ? "is-on" : ""}`} onClick={() => setRainEnabled((current) => !current)} aria-pressed={rainEnabled} title={rainEnabled ? "Ocultar la capa del mapa" : "Mostrar la capa del mapa"}>
        <span className="wizard-rain-icon"><WeatherIcon size={17} /></span>
        <span className="wizard-rain-copy"><strong>{selectedWeatherLayer.label.toLocaleUpperCase("es-BO")}</strong><small>{rainEnabled ? "Capa satelital activa" : "Capa apagada"}</small></span>
        <span className="wizard-rain-switch"><i /></span>
      </button>
      <div className="wizard-weather-options" role="group" aria-label="Variable para mostrar sobre el globo">
        {(Object.keys(WEATHER_LAYERS) as WeatherLayerId[]).map((id) => {
          const layer = WEATHER_LAYERS[id], Icon = layer.icon;
          return <button key={id} type="button" className={weatherLayer === id ? "is-selected" : ""} onClick={() => setWeatherLayer(id)} aria-pressed={weatherLayer === id}>
            <Icon size={12} /><span>{layer.label}</span>
          </button>;
        })}
      </div>
      {rainEnabled && <div className="wizard-rain-legend">
        <div><Droplets size={13} /><span>{weatherLayer === "rain" ? "Tasa de precipitación · mm/h" : selectedWeatherLayer.source}</span></div>
        <span className={`wizard-weather-gradient ${weatherLayer}`} />
        <div className="wizard-rain-scale"><span>{weatherLayer === "rain" ? "0.1 mm/h" : "Bajo"}</span><strong>{weatherLayer === "rain" ? "~10 km · 30 min" : `NASA GIBS · ${selectedWeatherLayer.cadence}`}</strong><span>{weatherLayer === "rain" ? "50+ mm/h" : "Alto"}</span></div>
      </div>}
     </div>
     </>}
   </>;
}
