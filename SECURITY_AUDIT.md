# Auditoría de seguridad y arquitectura — SignTalk

Fecha: 2026-08-10

## Resultado ejecutivo

No se identificaron vulnerabilidades críticas conocidas en las dependencias ni errores del linter remoto de PostgreSQL. La aplicación usa autenticación de Supabase, RLS en todas las tablas de usuario, Storage privado para el dataset y cabeceras de seguridad en Cloudflare.

Validaciones ejecutadas:

- `npm audit`: 0 vulnerabilidades en 414 dependencias.
- `tsc --noEmit`: correcto.
- Compilación Vite de producción: correcta.
- `supabase db lint --linked --level warning`: sin errores.
- Consultas anónimas a participantes, etiquetas y Storage: cero filas/objetos.
- Endpoint Gemini público: desactivado con HTTP 404.
- CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` y `Permissions-Policy`: activos en producción.

## Mejoras aplicadas

- MediaPipe fijado a `@mediapipe/tasks-vision@1.0.1`; se eliminó `@latest`.
- Endpoint Gemini desactivado también en servidor mediante `GEMINI_ANALYSIS_ENABLED=false`.
- Errores internos del proveedor ya no se exponen al cliente.
- Límite de tamaño validado por cabecera y por contenido real.
- Tipos de bindings de Cloudflare generados desde `wrangler.jsonc`.
- CSP y cabeceras defensivas añadidas a API y activos estáticos.
- Observabilidad de Workers activada con muestreo de 10%.
- Bucket `sign-dataset` privado, con máximo de 10 MB por clip y MIME de video permitido.
- RLS impide que una grabación se asocie a otro participante.
- Inserciones requieren consentimiento vigente de investigación y producto.
- Secuencias limitadas a 1–200 fotogramas JSON.
- Consentimiento versionado y flujo para retirar consentimiento/borrar aportes.
- Cola offline aislada por usuario en IndexedDB.

## Riesgos pendientes y mejoras propuestas

### Prioridad alta

1. **Revisión legal y comunitaria del consentimiento.** La redacción actual es técnicamente explícita, pero debe revisarse con asesoría legal dominicana y representantes de la comunidad sorda/LSD antes de una campaña pública amplia.
2. **Minimización de video.** Los clips pueden incluir rostro o fondo. Conviene recortar en el dispositivo una región alrededor de manos/cuerpo o permitir contribuir únicamente landmarks cuando el video no sea necesario.
3. **Panel de revisión separado.** Hace falta un backend administrativo con roles, auditoría y URLs firmadas temporales. Nunca debe exponerse una `service_role` en el navegador.

### Prioridad media

1. **Sesión absoluta de 48 horas en servidor.** La aplicación la aplica en el cliente, pero localStorage puede modificarse. Se recomienda una política/hook de sesión del lado de Supabase que fuerce la expiración absoluta.
2. **Cifrado de clips offline.** IndexedDB está aislado por origen, pero los blobs pendientes no tienen cifrado adicional. Se recomienda Web Crypto con una clave ligada a una sesión recuperable o evitar persistencia de video en equipos compartidos.
3. **Cuotas antiabuso.** Existe límite por archivo, pero no límite diario por usuario. Añadir una función SQL atómica con cuota por cuenta y día antes de aceptar metadatos.
4. **MFA y protección de formularios.** Exponer inscripción TOTP en la UI y añadir Turnstile a registro, recuperación y contribuciones si aparece abuso.
5. **Retención automática.** Definir un plazo contractual y un trabajo programado que elimine clips vencidos, no solo retiro manual.

### Prioridad baja / calidad operativa

1. Hospedar localmente WASM y modelos de MediaPipe para eliminar la dependencia de CDN en ejecución.
2. Eliminar gradualmente `'unsafe-inline'` de `style-src` migrando estilos dinámicos a clases o variables permitidas.
3. Añadir pruebas E2E móviles, pruebas de RLS autenticadas y pruebas de sincronización offline.
4. Separar módulos por carga diferida para reducir el bundle inicial, actualmente superior a 500 kB minificado.
5. Añadir revisión automática de dependencias y secretos en CI.

## Tecnologías relevantes

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4 y Lucide React.
- **Visión local:** MediaPipe Tasks Vision / Hand Landmarker, 21 puntos 3D por mano.
- **Web móvil:** `getUserMedia`, MediaRecorder, IndexedDB, Web Audio, Vibration API y Speech Synthesis.
- **Backend de datos:** Supabase Auth, PostgreSQL, Row Level Security y Supabase Storage privado.
- **Edge/hosting:** Cloudflare Workers y Static Assets, CSP, HSTS y observabilidad.
- **IA cloud:** Gemini 3.6 Flash permanece implementado pero desactivado públicamente.

## Lógica principal

### Traducción local

`Cámara → MediaPipe → landmarks → clasificación geométrica → consenso temporal de 4 muestras → resultado retenido → confirmación del usuario → frase/historial`

### Dataset LSD

`Consentimiento versionado → etiqueta LSD → clip de 3 segundos sin audio → landmarks cada ~66 ms → revisión del usuario → Storage privado + metadatos PostgreSQL`

Si no hay conexión, el video y sus metadatos se guardan en IndexedDB y se sincronizan al recuperar Internet. Cada participante mantiene un identificador estable que permitirá separar entrenamiento, validación y prueba por persona, evitando fuga de datos entre conjuntos.

### Seguridad de datos

`JWT Supabase → RLS por auth.uid() → carpeta Storage por user_id → consentimiento vigente → inserción → revisión pendiente`

Fuentes operativas: [Supabase Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [Cloudflare Static Asset Headers](https://developers.cloudflare.com/workers/static-assets/headers/), [MediaPipe Gesture customization](https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer).
