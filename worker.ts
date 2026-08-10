type WorkerEnv = Cloudflare.Env & { GEMINI_API_KEY?: string };

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
    return secureResponse(await env.ASSETS.fetch(request));
  },
};
