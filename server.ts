import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
app.use(express.json({ limit: '10mb' }));

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const authClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const SYSTEM_PROMPTS = {
  LSD: `Eres un intérprete experto de Lengua de Señas Dominicana (LSD).
Analiza la estructura esquelética y los fotogramas de la mano.
Ten en cuenta que la LSD comparte la dactilología base de la ASL, pero posee modismos, expresiones idiomáticas y vocabulario propio de la República Dominicana.
Traduce las señas a texto fluido en español dominicano estándar.`,
  ASL: `Eres un intérprete experto de Lengua de Señas Americana (ASL).
Analiza la estructura esquelética y los fotogramas de la mano.
Traduce el significado de la seña en ASL a texto claro en español.`,
} as const;

app.post('/api/translate-sign', async (req, res) => {
  try {
    if (process.env.VITE_ENABLE_GEMINI_ANALYSIS !== 'true') return res.status(404).json({ success: false, error: 'Recurso no disponible.' });
    const { imageData, landmarkData, currentSentence, targetLanguage = 'Spanish', variant = 'LSD' } = req.body;
    if (!ai) return res.status(503).json({ success: false, error: 'Gemini no está configurado en el servidor.' });
    if (!authClient) return res.status(503).json({ success: false, error: 'Supabase no está configurado en el servidor.' });
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, error: 'Sesión requerida.' });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return res.status(401).json({ success: false, error: 'Sesión inválida o expirada.' });
    if (!Array.isArray(landmarkData) || landmarkData.length === 0 || typeof imageData !== 'string') {
      return res.status(400).json({ success: false, error: 'Se requiere una captura y landmarks reales.' });
    }

    const selectedVariant: keyof typeof SYSTEM_PROMPTS = variant === 'ASL' ? 'ASL' : 'LSD';
    const prompt = `${SYSTEM_PROMPTS[selectedVariant]}
Analiza únicamente el gesto visible y los landmarks reales suministrados. No inventes una seña cuando la evidencia sea insuficiente.
Contexto actual: "${String(currentSentence || '').slice(-300)}". Idioma objetivo: ${String(targetLanguage).slice(0, 30)}.
Responde solamente este JSON compacto: {"translation":"palabra o frase breve","confidence":0.0,"detectedHand":"Right|Left|Both","gestureDetails":"descripción breve"}.`;
    const base64Data = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [
        { text: prompt },
        { text: `MediaPipe normalized landmarks: ${JSON.stringify(landmarkData)}` },
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
      ] },
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, maxOutputTokens: 512 },
    });
    const parsed = JSON.parse(response.text || '{}');
    if (!parsed.translation) return res.status(422).json({ success: false, error: 'No se identificó una seña con suficiente evidencia.' });
    return res.json({ success: true, translation: parsed.translation, confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null, detectedHand: parsed.detectedHand, gestureDetails: parsed.gestureDetails, source: model, variant: selectedVariant });
  } catch (cause) {
    console.error('Sign translation error:', cause);
    return res.status(500).json({ success: false, error: cause instanceof Error ? cause.message : 'Translation error' });
  }
});

export default app;
