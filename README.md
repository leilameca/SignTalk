# SignTalk

Aplicación React/Vite con cámara real, MediaPipe Hand Landmarker, análisis de señas con Gemini y autenticación/datos por usuario en Supabase.

La variante de interpretación puede cambiarse en Ajustes entre Lengua de Señas Dominicana (LSD, predeterminada) y American Sign Language (ASL). La selección se sincroniza en `user_preferences` y se envía en cada análisis a Gemini.

## Configuración

1. Crea un proyecto en Supabase y ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor.
2. En **Authentication > Providers**, habilita Email y Google. En Email activa **Confirm email**.
3. En Google Cloud crea las credenciales OAuth y usa la URL de callback que muestra Supabase. Copia el client ID/secret en el proveedor Google de Supabase.
4. En **Authentication > URL Configuration**, configura la URL del sitio y añade las URLs de redirección locales y de producción (por ejemplo, `http://localhost:3000/**`). Las confirmaciones y recuperaciones vuelven a la raíz de la app.
5. En **Authentication > Sessions**, usa un JWT expiry corto (se recomienda 3600 segundos y nunca más de 172800). La aplicación permite refresh tokens, pero guarda el inicio de sesión original y fuerza el cierre al llegar a 48 horas.
6. Copia `.env.example` a `.env.local` y completa los valores. `GEMINI_API_KEY` es solo de servidor; nunca debe llevar el prefijo `VITE_`.

## Desarrollo

```bash
npm install
npm run dev
```

Vite monta el endpoint Express `/api/translate-sign` en desarrollo y vista previa. En producción, despliega `server.ts` como función/servidor Node junto a los archivos de `dist`, manteniendo las variables privadas en el entorno del servidor. La cámara requiere HTTPS (o `localhost`).

En Cloudflare, `worker.ts` implementa el mismo endpoint y sirve los assets compilados según `wrangler.jsonc`. Publica con `npm run deploy:cloudflare` y configura `GEMINI_API_KEY` como secreto mediante `wrangler secret put GEMINI_API_KEY`.

## Pipeline de entrenamiento LSD

Las grabaciones aprobadas en el panel administrativo no cambian el lector en tiempo real. El flujo actual es:

1. El usuario graba y sube muestras desde la app; quedan en Supabase con estado `pending`.
2. El administrador aprueba o rechaza cada muestra desde el panel de administración.
3. Solo las muestras con estado `approved` se exportan desde Supabase por el script de entrenamiento.
4. El workflow de GitHub Actions entrena un nuevo modelo TensorFlow.js y publica los artefactos en `public/models/lsd/`.
5. La app solo empieza a usar ese nuevo modelo cuando el manifiesto `public/models/lsd/manifest.json` cambia a `available: true`.

Si el manifiesto sigue en `available: false` o `version: "collecting-data"`, las muestras aprobadas aún no están activas en la app. La forma más simple es ejecutar este comando localmente después de definir las variables de entorno necesarias:

```bash
npm run publish:lsd
```

Ese comando exporta las muestras `approved` desde Supabase, entrena un nuevo modelo LSD y lo publica en `public/models/lsd/`. Para que funcione, necesitas definir al menos `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Si además quieres desplegarlo automáticamente a Cloudflare, usa el workflow de GitHub Actions con los secretos `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

> Importante: guarda `GITHUB_TOKEN` únicamente como secreto del Worker (`wrangler secret put GITHUB_TOKEN`). Para un PAT fine-grained selecciona exclusivamente `leilameca/SignTalk` y concede **Actions: Read and write**; `Metadata: Read-only` se agrega automáticamente. Para un PAT clásico se necesita el alcance `repo`. Nunca coloques el token en `wrangler.jsonc`, `.env.local`, el frontend o Git.

## Seguridad y datos

- La API valida el access token de Supabase antes de invocar Gemini.
- Row Level Security limita perfiles, preferencias e historial al usuario autenticado.
- No hay resultados simulados: Gemini solo se invoca cuando MediaPipe detectó landmarks reales y se adjunta un fotograma real.
- El historial y preferencias se guardan en Supabase; no se usa `localStorage` para esos datos.
