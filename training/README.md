# Entrenamiento del modelo LSD

Este proceso usa exclusivamente secuencias de landmarks aprobadas. Los videos privados no se descargan para entrenar la primera versión.

Importante: aprobar una muestra en el panel administrativo no cambia el lector inmediatamente. La muestra solo se incorpora al próximo entrenamiento cuando el pipeline exporta `sign_recordings` con `status = approved` y publica un nuevo modelo en `public/models/lsd/`.

## Protección de calidad

Las reglas se leen desde Supabase y se pueden editar en **Panel de administración → Reglas de entrenamiento**. El valor inicial es 1 muestra de 1 participante por seña.

El entrenamiento se detiene sin modificar el modelo publicado cuando ocurre cualquiera de estos casos:

- falta la clase neutral `none`;
- alguna seña no alcanza las muestras configuradas;
- alguna seña no alcanza los participantes configurados;
- una división por participante queda sin alguna clase;
- macro F1 es menor que 0.70;
- el recall de cualquier clase es menor que 0.45.

Con menos de 3 participantes se usa un modo experimental con pequeñas variaciones artificiales. Este modo permite comenzar, pero sus métricas se calculan sobre los mismos participantes y no demuestran generalización. Al reunir suficientes personas, el proceso cambia automáticamente a divisiones de entrenamiento, validación y prueba por participante.

## Ejecución local

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r training\requirements.txt
$env:SUPABASE_URL='https://TU-PROYECTO.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='CONFIGURAR-SOLO-EN-EL-ENTORNO'
python training\export_dataset.py
python training\train.py
npm run build
```

Nunca guardes `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`, el código frontend ni Git.

Para publicar las muestras aprobadas de la forma más simple, desde la raíz del proyecto ejecuta:

```bash
npm run publish:lsd
```

Ese comando corre `training/export_dataset.py` y `training/train.py` de una vez, usando las muestras aprobadas para generar un nuevo modelo LSD en `public/models/lsd/`.

## Automatización

El workflow `.github/workflows/train-lsd-model.yml` se puede ejecutar manualmente y también intenta entrenar cada lunes. Configura estos secretos en GitHub Actions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Si no hay datos suficientes o el candidato no supera la evaluación, el workflow falla antes del despliegue y la aplicación conserva el modelo anterior.

Cuando el candidato supera las reglas, el workflow lo despliega en Cloudflare y guarda automáticamente los artefactos de `public/models/lsd/` en la rama `main`. Para ello, el workflow declara `contents: write`, pero el paso de persistencia solo agrega esa carpeta al commit de `github-actions[bot]`.

## Archivos publicados

Un entrenamiento aprobado genera:

- `public/models/lsd/model.json`
- `public/models/lsd/group*.bin`
- `public/models/lsd/manifest.json`
- `public/models/lsd/evaluation.json`

SignTalk consulta el manifiesto al iniciar y vuelve a comprobarlo periódicamente. Si `available` es `false`, mantiene el clasificador geométrico; si es `true`, carga TensorFlow.js de manera diferida. El panel administrativo revisa la versión cada 30 segundos y la cámara cada 60 segundos, por lo que una pestaña abierta adopta el modelo nuevo sin reinstalar la aplicación.
