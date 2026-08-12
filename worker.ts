type WorkerEnv = Cloudflare.Env & {
  GEMINI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  GEMINI_ANALYSIS_ENABLED?: string;
  GEMINI_MODEL?: string;
};

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

interface TranslationResult {
  translation?: string;
  confidence?: number;
  detectedHand?: string;
  gestureDetails?: string;
}

const SYSTEM_PROMPTS = {
  LSD: `Eres un intérprete experto de Lengua de Señas Dominicana (LSD).
Analiza la estructura esquelética y los fotogramas de la mano.
Ten en cuenta que la LSD comparte la dactilología base de la ASL, pero posee modismos, expresiones idiomáticas y vocabulario propio de la República Dominicana.
Traduce las señas a texto fluido en español dominicano estándar.`,
  ASL: `Eres un intérprete experto de Lengua de Señas Americana (ASL).
Analiza la estructura esquelética y los fotogramas de la mano.
Traduce el significado de la seña en ASL a texto claro en español.`,
} as const;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function secureResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set('content-security-policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://storage.googleapis.com; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  secured.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  secured.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  secured.headers.set('x-content-type-options', 'nosniff');
  secured.headers.set('x-frame-options', 'DENY');
  secured.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return secured;
}

async function publishModel(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    return json({ success: false, error: 'Falta configurar GITHUB_TOKEN o GITHUB_REPOSITORY en el Worker.' }, 503);
  }
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ success: false, error: 'Sesión requerida.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ success: false, error: 'Supabase no está configurado.' }, 503);

  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization, apikey: env.SUPABASE_ANON_KEY || '' } });
  if (!authResponse.ok) return json({ success: false, error: 'Sesión inválida o expirada.' }, 401);

  const githubHeaders = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'SignTalk-Admin-Publish/1.0',
  };
  const adminResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_app_admin`, {
    method: 'POST',
    headers: {
      authorization,
      apikey: env.SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  const isAdmin = adminResponse.ok ? await adminResponse.json() : false;
  if (isAdmin !== true) return json({ success: false, error: 'Acceso administrativo requerido.' }, 403);

  const runsResponse = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/train-lsd-model.yml/runs?per_page=5`, { headers: githubHeaders });
  if (runsResponse.ok) {
    const runs = await runsResponse.json() as { workflow_runs?: Array<{ status?: string; html_url?: string }> };
    const activeRun = runs.workflow_runs?.find((run) => run.status === 'queued' || run.status === 'in_progress');
    if (activeRun) return json({ success: true, alreadyRunning: true, message: 'Ya existe un entrenamiento en curso.', runUrl: activeRun.html_url }, 202);
  }

  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/train-lsd-model.yml/dispatches`, {
    method: 'POST',
    headers: {
      ...githubHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { triggerSource: 'admin-panel' } }),
  });

  if (!response.ok) {
    console.error('GitHub workflow dispatch failed:', response.status, response.headers.get('x-github-request-id'));
    const error = response.status === 401 ? 'El token de GitHub no es válido.'
      : response.status === 403 ? 'El token de GitHub necesita permiso Actions: write.'
        : response.status === 404 ? 'GitHub no encontró el repositorio o el workflow.'
          : response.status === 422 ? 'La configuración del workflow todavía no coincide con la solicitud.'
            : 'GitHub no pudo iniciar el entrenamiento.';
    return json({ success: false, error }, 502);
  }

  return json({ success: true, message: 'Entrenamiento enviado a GitHub Actions.' }, 202);
}

async function modelRunStatus(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) return json({ success: false, error: 'GitHub Actions no está configurado.' }, 503);
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ success: false, error: 'Sesión requerida.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ success: false, error: 'Supabase no está configurado.' }, 503);

  const [authResponse, adminResponse] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization, apikey: env.SUPABASE_ANON_KEY } }),
    fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_app_admin`, {
      method: 'POST',
      headers: { authorization, apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: '{}',
    }),
  ]);
  if (!authResponse.ok) return json({ success: false, error: 'Sesión inválida o expirada.' }, 401);
  const isAdmin = adminResponse.ok ? await adminResponse.json() : false;
  if (isAdmin !== true) return json({ success: false, error: 'Acceso administrativo requerido.' }, 403);

  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/train-lsd-model.yml/runs?per_page=1`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SignTalk-Admin-Status/1.0',
    },
  });
  if (!response.ok) return json({ success: false, error: 'No se pudo consultar el entrenamiento.' }, 502);
  const payload = await response.json() as { workflow_runs?: Array<{ id: number; status: string; conclusion: string | null; html_url: string; created_at: string; updated_at: string; head_sha: string }> };
  const run = payload.workflow_runs?.[0];
  return json({ success: true, run: run ? { id: run.id, status: run.status, conclusion: run.conclusion, runUrl: run.html_url, createdAt: run.created_at, updatedAt: run.updated_at, commit: run.head_sha.slice(0, 7) } : null });
}

async function translate(request: Request, env: WorkerEnv): Promise<Response> {
  if (env.GEMINI_ANALYSIS_ENABLED !== 'true') return json({ success: false, error: 'Recurso no disponible.' }, 404);
  if (!env.GEMINI_API_KEY) return json({ success: false, error: 'Gemini no está configurado en producción.' }, 503);
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ success: false, error: 'Sesión requerida.' }, 401);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 2_000_000) return json({ success: false, error: 'La captura excede el tamaño permitido.' }, 413);

  const [authResponse, payload] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization, apikey: env.SUPABASE_ANON_KEY } }),
    request.json() as Promise<Record<string, unknown>>,
  ]);
  if (!authResponse.ok) return json({ success: false, error: 'Sesión inválida o expirada.' }, 401);

  const { imageData, landmarkData, currentSentence, targetLanguage = 'Spanish', variant = 'LSD' } = payload;
  if (!Array.isArray(landmarkData) || !landmarkData.length || typeof imageData !== 'string') return json({ success: false, error: 'Se requiere una captura y landmarks reales.' }, 400);
  if (imageData.length > 1_500_000 || JSON.stringify(landmarkData).length > 100_000) return json({ success: false, error: 'La captura excede el tamaño permitido.' }, 413);
  const selectedVariant: keyof typeof SYSTEM_PROMPTS = variant === 'ASL' ? 'ASL' : 'LSD';
  const prompt = `${SYSTEM_PROMPTS[selectedVariant]}
Analiza únicamente el gesto visible y los landmarks reales suministrados. No inventes una seña cuando la evidencia sea insuficiente.
Contexto actual: "${String(currentSentence || '').slice(-300)}". Idioma objetivo: ${String(targetLanguage).slice(0, 30)}.
Responde solamente este JSON compacto: {"translation":"palabra o frase breve","confidence":0.0,"detectedHand":"Right|Left|Both","gestureDetails":"descripción breve"}.`;
  const base64Data = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
  const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { text: `MediaPipe normalized landmarks: ${JSON.stringify(landmarkData)}` }, { inline_data: { mime_type: 'image/jpeg', data: base64Data } }] }],
      generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 512 },
    }),
  });
  const gemini = await geminiResponse.json() as GeminiResponse;
  if (!geminiResponse.ok) return json({ success: false, error: geminiResponse.status === 429 ? 'Servicio temporalmente saturado.' : 'No se pudo completar el análisis.' }, geminiResponse.status);
  const text = gemini?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(text) as TranslationResult;
  if (!parsed.translation) return json({ success: false, error: 'No se identificó una seña con suficiente evidencia.' }, 422);
  return json({ success: true, ...parsed, source: model, variant: selectedVariant });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/translate-sign' && request.method === 'POST') {
      try { return secureResponse(await translate(request, env)); }
      catch { return secureResponse(json({ success: false, error: 'Error interno.' }, 500)); }
    }
    if (url.pathname === '/api/admin/publish-lsd-model' && request.method === 'POST') {
      try { return secureResponse(await publishModel(request, env)); }
      catch { return secureResponse(json({ success: false, error: 'Error interno.' }, 500)); }
    }
    if (url.pathname === '/api/admin/lsd-model-run' && request.method === 'GET') {
      try { return secureResponse(await modelRunStatus(request, env)); }
      catch { return secureResponse(json({ success: false, error: 'Error interno.' }, 500)); }
    }
    return secureResponse(await env.ASSETS.fetch(request));
  },
};
