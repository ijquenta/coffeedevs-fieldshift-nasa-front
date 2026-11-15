# Contrato de API · Wizard de Yanapiri Agro

La interfaz se conecta mediante `src/services/wizard.ts`. Los componentes no llaman directamente al backend. En desarrollo `NEXT_PUBLIC_USE_MOCK=true` usa respuestas determinísticas con el mismo contrato; `false` usa `NEXT_PUBLIC_API_BASE_URL`.

## Preparar el análisis

`POST {API_BASE}/diagnostico`

Request:

```json
{
  "polygon": { "type": "Feature", "properties": {}, "geometry": { "type": "Polygon", "coordinates": [[[-66.1573, -17.3899], [-66.1563, -17.3899], [-66.1563, -17.3891], [-66.1573, -17.3891], [-66.1573, -17.3899]]] } },
  "areaHa": 0.82,
  "centroide": [-66.1568, -17.3895],
  "fechaSiembra": { "tipo": "fecha", "desde": "2026-11-20", "hasta": "2026-11-20" },
  "productos": ["Quinua", "Haba"],
  "prioridades": ["Ahorrar agua", "Mejorar el suelo"],
  "ubicacion": { "country": "Bolivia", "countryCode": "BOL", "department": "Cochabamba", "municipality": "Cochabamba", "pcode": "BO-C-0301" },
  "recomendar": false,
  "notas": "Riego por acequia"
}
```

`fechaSiembra.tipo` es `fecha`, `rango` o `flexible`; el rango flexible puede incluir `semanasFlexibles`. Los anillos GeoJSON usan orden WGS84 `[longitud, latitud]` y el primer punto se repite al final.

Response:

```json
{
  "probabilidades": [{
    "cultivo": "Quinua", "min": 65, "max": 76, "confianza": "media",
    "motivoConfianza": "Señal climática regional; faltan datos de manejo local.",
    "fuentes": ["NASA POWER", "SMAP", "GPM IMERG"],
    "riesgos": ["El resultado puede diferir dentro de la parcela."],
    "vacios": ["Textura y pH del suelo", "Variedad y fecha real de siembra"]
  }],
  "variables": {
    "humedadSuelo": "38–49%", "lluvia": "18–36 mm", "temperatura": "12–18 °C",
    "vegetacion": "NDVI 0,42–0,61", "relieve": "Pendiente 2–8%"
  },
  "vaciosDeInformacion": ["Análisis local de suelo", "Costos e información de mercado"],
  "metadatos": {
    "generadoEn": "2026-11-14T14:00:00.000Z", "esDatoDeEjemplo": false,
    "zona": "Cochabamba, Cochabamba, Bolivia", "areaHa": 0.82,
    "centroide": [-66.1568, -17.3895]
  }
}
```

El porcentaje `min–max` representa una banda de idoneidad comparativa y debe incluir confianza, motivo, fuentes, riesgos y vacíos. No debe describirse como probabilidad garantizada de cosecha. `esDatoDeEjemplo` controla la etiqueta visible de demostración.

## Sugerencias y alertas

`POST {API_BASE}/sugerencias` recibe el mismo request. `alertas` usa `tipo` (`sequia|helada|inundacion|erosion|otro`), `nivel` (`bajo|medio|alto`), `ventana` (`desde`,`hasta`), `motivo`, `confianza`, `fuentes` y `accionSugerida`. También devuelve `recomendaciones[]` (`titulo`, `detalle`, `prioridades`, `confianza`), `vaciosDeInformacion[]` y `metadatos{generadoEn,esDatoDeEjemplo}`.

## Chat contextual

`POST {API_BASE}/chat`:

```json
{
  "mensaje": "¿Qué debería revisar antes de sembrar?",
  "historial": [{ "role": "user", "content": "¿Cómo está el agua?" }],
  "contexto": {
    "parcela": { "areaHa": 0.82, "centroide": [-66.1568, -17.3895], "ubicacion": { "country": "Bolivia", "countryCode": "BOL", "department": "Cochabamba", "municipality": "Cochabamba" }, "productos": ["Quinua"], "fechaSiembra": { "tipo": "fecha", "desde": "2026-11-20", "hasta": "2026-11-20" }, "prioridades": ["Ahorrar agua"] },
    "diagnostico": {}, "sugerencias": {}
  }
}
```

Response: `{ "respuesta": "..." }`. El backend debe agregar el contexto estructurado al prompt del modelo. Instrucción de sistema recomendada: responder solo con lo respaldado por el contexto, indicar incertidumbre y recordar que el sistema apoya —no reemplaza— al agricultor ni a un agrónomo local. La clave del LLM se guarda solo en el servidor.

## Búsqueda de lugares

El navegador usa `GET /api/geocode?q=...`; el Route Handler consulta Nominatim y aplica `User-Agent` identificable, idioma español, caché de un minuto y pausa global de más de un segundo entre peticiones. La UI espera al menos 1,1 s desde la última edición antes de enviar una búsqueda. Consultar [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/) antes de escalar; para producción con mucho tráfico, usar un proveedor contratado o una instancia propia.

## Códigos de error

| Estado | Significado | Respuesta sugerida |
| --- | --- | --- |
| 400 | Campos ausentes, fechas inválidas o geometría GeoJSON no válida | `{ "error": "...", "code": "validation_error" }` |
| 429 | Límite de peticiones / proveedor geográfico ocupado | `{ "error": "...", "code": "rate_limited" }` |
| 502 | Falla de un proveedor satelital o de mapas | `{ "error": "...", "code": "upstream_error" }` |
| 503 | Datos todavía no disponibles para la región o periodo | `{ "error": "...", "code": "data_unavailable" }` |
| 500 | Error inesperado del servidor | `{ "error": "...", "code": "internal_error" }` |

El cliente tiene un timeout de 20 segundos, cancela peticiones con `AbortController` y verifica la forma superior de cada JSON. El backend debe validar rangos, propiedades y coordenadas antes de procesar.

## Fuentes de observación previstas

| Variable / capa | Producto candidato | Alcance y límite interpretativo |
| --- | --- | --- |
| Temperatura y meteorología | NASA POWER | Resolución nativa de la fuente que alimenta cada variable; no equivale a una medición dentro de la finca. |
| Humedad de suelo | SMAP L4 / NASA POWER de alta resolución | Aproximadamente 9 km; humedad modelada y asimilada, de escala regional. |
| Precipitación | GPM IMERG | Aproximadamente 0,1° (~10 km), intervalo temporal variable según producto. |
| Estado de vegetación | MODIS / Landsat | NDVI se deriva de bandas ópticas; nubes, resolución y frecuencia condicionan cada escena. |
| Elevación / pendiente | SRTM | Modelo de elevación; pendiente derivada. No sustituye el levantamiento topográfico del lote. |
| Suelo local, costos y variedades | Fuente local / agricultor | No son variables que estos productos de NASA conozcan por sí solos; solicitar mediciones o ingresarlas. |

La resolución espacial y temporal debe llegar en metadatos de cada fuente real y mostrarse en el diagnóstico. Una celda satelital puede cubrir varios campos; no interpolar el mapa del globo como si mostrara diferencias observadas dentro de la parcela.

## Variables de entorno

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_MAX_PREDICTION_AREA_HA=1000
NEXT_PUBLIC_MIN_PARCEL_HA=0.01
NEXT_PUBLIC_CESIUM_ION_TOKEN=
GEOCODER_CONTACT_EMAIL=equipo@ejemplo.org
```

El repo revisado no contenía un service worker, `next-pwa` ni un manifiesto instalable. Esta migración no elimina una configuración PWA existente; la incorporación de caché offline queda como trabajo separado.
