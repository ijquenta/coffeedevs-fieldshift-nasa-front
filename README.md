# Yanapiri Agro · Wizard de campo

Interfaz Next.js para el reto NASA Space Apps Challenge 2026, “Field Shift: Adapting Farms with NASA Data”. La ruta `/` abre directamente el flujo de tres pasos: ubicación y parcela, planes de siembra y resultados.

## Desarrollo local

1. Instala Node.js `>=22.17` (Cesium lo requiere) y ejecuta `npm ci`.
2. Copia `.env.example` a `.env.local` si necesitas cambiar los valores.
3. Ejecuta `npm run dev` y abre [http://localhost:3000](http://localhost:3000).

Por defecto el diagnóstico, las alertas y el chat usan datos determinísticos de ejemplo (`NEXT_PUBLIC_USE_MOCK=true`). No son mediciones NASA actuales ni recomendaciones agronómicas validadas. Para usar el servicio del equipo, configura `NEXT_PUBLIC_API_BASE_URL` y `NEXT_PUBLIC_USE_MOCK=false`; los endpoints y contratos están en [docs/api-wizard.md](docs/api-wizard.md).

El mapa Cesium funciona del lado del cliente y usa los recursos copiados en `public/cesium/`. Si el acceso de imágenes/base map requiere Ion, configura `NEXT_PUBLIC_CESIUM_ION_TOKEN` en `.env.local`.

La búsqueda de lugares pasa por `/api/geocode` y usa Nominatim con debounce, caché breve y control de frecuencia. Revisa su política antes de producción; para tráfico de equipo, configura un proveedor geográfico propio.

## Comandos

```bash
npm run dev
npm run lint
npm run build
```

## PWA y uso móvil

La app define su manifiesto en `src/app/manifest.ts` (servido como `/manifest.webmanifest`) y guarda los iconos PWA en `public/icons/` para Android, iOS y dispositivos maskable. Incluye un control de instalación y un service worker de producción. El service worker conserva la pantalla visitada y los recursos estáticos locales del wizard/Cesium, y ofrece una página breve si se abre sin conexión. Las consultas de geocodificación y análisis no se guardan en caché: requieren conexión para devolver datos actuales.

Para probar la instalación, ejecuta `npm run build` y `npm run start` y abre el sitio desde `localhost` o un origen HTTPS. Los navegadores bloquean service workers en orígenes HTTP inseguros. El modo de desarrollo no registra el service worker para evitar que una caché vieja interfiera con los cambios.

Los estilos móviles viven en `src/app/responsive.css`: los formularios se leen antes del mapa en pantallas estrechas, el mapa conserva una altura útil y las tarjetas ya no quedan atrapadas en paneles con scroll interno.

# coffeedevs-fieldshift-nasa-front
