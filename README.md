# SignTalk

SignTalk es una aplicación web responsiva para apoyar la comunicación mediante Lengua de Señas Dominicana (LSD) y American Sign Language (ASL). Usa la cámara real, MediaPipe Hands y un modelo TensorFlow.js entrenado con aportes revisados por administradores.

Producción: [signtalk-express.leilanycristaldedios.workers.dev](https://signtalk-express.leilanycristaldedios.workers.dev)

## Funciones principales

- Cámara frontal o trasera mediante `navigator.mediaDevices.getUserMedia`.
- Seguimiento de hasta dos manos con MediaPipe Hand Landmarker.
- Traducción continua local y retroalimentación de confianza.
- Selector de variante LSD o ASL guardado en las preferencias del usuario.
- Autenticación con Email/Contraseña y Google OAuth mediante Supabase.
- Confirmación de correo, recuperación de contraseña y cierre obligatorio a las 48 horas.
- Historial, frases y preferencias con soporte local y sincronización por usuario.
- Grabación privada de ejemplos para mejorar el modelo LSD.
- Panel administrativo para revisar grabaciones, configurar reglas y publicar modelos.
- Propuestas comunitarias de palabras y frases que no estén en el catálogo.
- Entrenamiento automático con GitHub Actions y despliegue en Cloudflare Workers.

El análisis con Gemini es opcional y está deshabilitado en la interfaz pública mientras se prioriza la inferencia local de baja latencia.

## Tecnologías

- React, TypeScript y Vite.
- Tailwind CSS.
- MediaPipe Tasks Vision.
- TensorFlow/Keras para entrenamiento y TensorFlow.js para inferencia en el navegador.
- Supabase Auth, PostgreSQL, Row Level Security y Storage privado.
- GitHub Actions para entrenamiento, evaluación y publicación.
- Cloudflare Workers para la aplicación, los endpoints protegidos y los archivos estáticos.

## Configuración inicial

1. Crea un proyecto en Supabase.
2. Para una instalación nueva, ejecuta [`supabase/schema.sql`](supabase/schema.sql) en SQL Editor. Para un proyecto enlazado usa `npx supabase db push`.
3. En **Authentication → Providers**, habilita Email y Google. Activa la confirmación de correo para Email.
4. Configura en Google Cloud el callback indicado por Supabase y copia el Client ID y Client Secret al proveedor Google.
5. En **Authentication → URL Configuration**, registra la URL local y la URL de producción.
6. Mantén el JWT con expiración corta. La aplicación conserva el instante del inicio original y cierra la sesión al cumplir 48 horas aunque se hayan renovado tokens.
7. Copia `.env.example` a `.env.local` y completa las variables públicas/locales.

Nunca uses el prefijo `VITE_` para claves privadas como `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, tokens de GitHub o tokens de Cloudflare.

## Desarrollo local

```bash
npm install
npm run dev
```

Comandos útiles:

```bash
npm run build
npm run preview
npm run deploy:cloudflare
```

La cámara requiere HTTPS o `localhost`. En desarrollo, Vite conecta el endpoint Express de [`server.ts`](server.ts). En producción, [`worker.ts`](worker.ts) implementa los endpoints y sirve `dist` según [`wrangler.jsonc`](wrangler.jsonc).

## Variables y secretos

### Aplicación local

Consulta [`.env.example`](.env.example). Como mínimo se necesitan las variables públicas de Supabase. Gemini solo es necesario si se habilita su análisis opcional.

### Secretos del Worker de Cloudflare

Configúralos con el prompt interactivo de Wrangler; no escribas sus valores en comandos, archivos o Git:

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GEMINI_API_KEY
```

`GITHUB_TOKEN` permite que el botón administrativo dispare el workflow. Para un PAT fine-grained:

- limita el acceso únicamente a `leilameca/SignTalk`;
- concede **Actions: Read and write**;
- conserva **Metadata: Read-only**.

Un PAT clásico necesita el alcance `repo`. La variable pública `GITHUB_REPOSITORY` se mantiene en `wrangler.jsonc`.

### Secretos de GitHub Actions

El workflow de entrenamiento requiere:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

La clave `SUPABASE_SERVICE_ROLE_KEY` puede omitir RLS. Solo debe existir como secreto cifrado del runner de entrenamiento y nunca en el frontend.

## Aportes de grabaciones

1. La persona acepta el consentimiento de investigación y producto.
2. Selecciona una etiqueta LSD y graba aproximadamente tres segundos.
3. MediaPipe guarda la secuencia de landmarks; el video se almacena en el bucket privado `sign-dataset`.
4. La grabación queda `pending`.
5. Un administrador reproduce el video y lo aprueba o rechaza.
6. Solo las grabaciones `approved` se exportan para entrenar.

Si la conexión falla, la grabación queda temporalmente en IndexedDB y se sincroniza al recuperar Internet.

## Palabras y frases propuestas por la comunidad

Cuando una palabra o frase no está en el selector, la persona puede abrir **¿No encuentras la palabra o frase?**, escribir hasta 80 caracteres y seleccionar el tipo de seña.

El flujo moderado es:

1. La propuesta se guarda en `sign_label_proposals` como `pending`.
2. El administrador la revisa desde **Palabras y frases propuestas**.
3. Al aprobarla, se crea automáticamente una etiqueta activa en `sign_labels`.
4. La etiqueta aparece en el selector de aportes.
5. Las personas pueden grabarla.
6. La nueva clase entra al modelo cuando sus grabaciones cumplen las reglas y se publica otro entrenamiento.

Aprobar el texto no entrena una seña sin grabaciones.

## Entrenamiento y publicación del modelo LSD

El administrador puede pulsar **Publicar modelo LSD**. El Worker:

1. valida la sesión de Supabase;
2. verifica `is_app_admin()`;
3. evita iniciar otro proceso si ya existe uno en cola o ejecutándose;
4. dispara `.github/workflows/train-lsd-model.yml` en GitHub.

El workflow:

1. exporta de Supabase exclusivamente landmarks de grabaciones LSD aprobadas;
2. valida cobertura, participantes y la clase neutral `none`;
3. entrena y evalúa el modelo GRU;
4. convierte el resultado a TensorFlow.js;
5. compila la aplicación;
6. despliega aplicación y modelo en Cloudflare;
7. guarda los artefactos aprobados en `main` mediante `github-actions[bot]`.

Con el dataset inicial, una ejecución suele tardar entre **2 y 3 minutos**. El panel comprueba el manifiesto cada 30 segundos y la cámara cada 60 segundos, por lo que una pestaña abierta puede tardar hasta un minuto adicional en detectar la versión.

El workflow tiene `contents: write` únicamente para ejecutar `git add public/models/lsd/` y conservar:

- `public/models/lsd/manifest.json`
- `public/models/lsd/model.json`
- `public/models/lsd/group*.bin`
- `public/models/lsd/evaluation.json`

Esto evita que un despliegue posterior de interfaz sustituya el modelo por el manifiesto inicial `collecting-data`.

## Reglas de calidad

Las reglas se administran desde el panel y se guardan en `model_training_settings`.

La configuración inicial de 1 muestra y 1 participante permite comprobar el flujo, pero genera un modelo experimental. En ese modo las métricas usan resustitución y no demuestran que el modelo reconozca a otras personas.

Para obtener precisión útil se recomienda por cada seña:

- al menos 5–10 grabaciones para las primeras pruebas;
- al menos 3 participantes;
- variaciones de velocidad, distancia, orientación e iluminación;
- ejemplos correctos de `none`, con manos visibles pero sin formar una seña;
- revisar confusiones entre señas visualmente parecidas.

El umbral de confianza predeterminado es alto. Durante la fase experimental puede probarse entre `0.60` y `0.70`, observando falsos positivos antes de subirlo nuevamente.

El entrenamiento se detiene sin reemplazar el modelo cuando faltan clases obligatorias, no se cumplen las reglas configuradas o el candidato falla las métricas mínimas.

## Recarga del modelo en la cámara

La cámara muestra **LSD IA**, la marca experimental y los primeros caracteres de la versión cuando el modelo está cargado. Si muestra **LSD en recopilación**, no existe un modelo disponible o la pestaña todavía no ha actualizado el manifiesto.

El cargador:

- consulta `manifest.json` sin caché;
- vuelve a comprobarlo cada 60 segundos;
- compara la versión publicada;
- descarga `model.json` con la versión como parámetro de caché;
- sustituye el modelo anterior sin reinstalar la aplicación.

## Entrenamiento local

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r training\requirements.txt
$env:SUPABASE_URL='https://TU-PROYECTO.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='CONFIGURAR-SOLO-EN-EL-ENTORNO'
npm run publish:lsd
```

`npm run publish:lsd` exporta y genera los artefactos localmente. Para publicarlos también debes compilar y desplegar, o ejecutar el workflow de GitHub Actions.

Consulta [`training/README.md`](training/README.md) para detalles del preprocesamiento, evaluación y formato del modelo.

## Seguridad

- RLS limita perfiles, preferencias, historial, aportes y propuestas.
- Los videos del dataset permanecen privados y los enlaces administrativos son temporales.
- El endpoint de publicación exige sesión válida y rol administrativo en el servidor.
- Los detalles internos de errores de GitHub no se devuelven al navegador.
- El botón de publicación evita ejecuciones simultáneas.
- Las propuestas comunitarias no se convierten en etiquetas sin aprobación.
- Los secretos no deben almacenarse en el repositorio ni enviarse al cliente.
