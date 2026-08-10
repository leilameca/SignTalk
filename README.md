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

## Seguridad y datos

- La API valida el access token de Supabase antes de invocar Gemini.
- Row Level Security limita perfiles, preferencias e historial al usuario autenticado.
- No hay resultados simulados: Gemini solo se invoca cuando MediaPipe detectó landmarks reales y se adjunta un fotograma real.
- El historial y preferencias se guardan en Supabase; no se usa `localStorage` para esos datos.
