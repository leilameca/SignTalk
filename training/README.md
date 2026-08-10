# Entrenamiento del modelo LSD

Este proceso usa exclusivamente secuencias de landmarks aprobadas. Los videos privados no se descargan para entrenar la primera versión.

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

## Automatización

El workflow `.github/workflows/train-lsd-model.yml` se puede ejecutar manualmente y también intenta entrenar cada lunes. Configura estos secretos en GitHub Actions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Si no hay datos suficientes o el candidato no supera la evaluación, el workflow falla antes del despliegue y la aplicación conserva el modelo anterior.

## Archivos publicados

Un entrenamiento aprobado genera:

- `public/models/lsd/model.json`
- `public/models/lsd/group*.bin`
- `public/models/lsd/manifest.json`
- `public/models/lsd/evaluation.json`

SignTalk consulta el manifiesto al iniciar. Si `available` es `false`, mantiene el clasificador geométrico; si es `true`, carga TensorFlow.js de manera diferida y usa el modelo temporal.
