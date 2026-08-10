import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Activity, AlertCircle, Camera, Check, Copy, Loader2, RotateCcw, Send, Smartphone, SwitchCamera, Trash2, Volume2, WifiOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { triggerHaptic } from '../../utils/haptics';
import { classifyLocalSign, classifyLocalSignSequence, type LocalSignFrame, type LocalSignPrediction } from '../../utils/localSignClassifier';
import { loadLsdModel, predictLsdSequence, type LsdLoadedModel, type LsdSequenceFrame } from '../../utils/lsdModel';

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const GEMINI_ANALYSIS_ENABLED = import.meta.env.VITE_ENABLE_GEMINI_ANALYSIS === 'true';

export const CameraTranslatorScreen: React.FC = () => {
  const { session } = useAuth();
  const { activeSentence, addWordToSentence, clearSentence, removeLastWord, commitSentenceToHistory, speakPhrase, isSpeaking, isCapturing, setIsCapturing, detection, setDetection } = useApp();
  const { activeTheme, settings } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const landmarksRef = useRef<NormalizedLandmark[][]>([]);
  const animationRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const lastLocalInferenceRef = useRef(0);
  const localSamplesRef = useRef<LocalSignPrediction[]>([]);
  const localFramesRef = useRef<LocalSignFrame[]>([]);
  const neutralSinceRef = useRef<number | null>(null);
  const lastAutoAddedRef = useRef<{ label: string; timestamp: number } | null>(null);
  const lsdModelRef = useRef<LsdLoadedModel>(null);
  const lsdFramesRef = useRef<LsdSequenceFrame[]>([]);
  const lsdSamplesRef = useRef<LocalSignPrediction[]>([]);
  const lsdInferenceRunningRef = useRef(false);
  const lastLsdFrameRef = useRef(0);
  const lastLsdInferenceRef = useRef(0);
  const lastGeminiRequestRef = useRef(0);
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'denied' | 'unsupported'>('starting');
  const [trackingReady, setTrackingReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastTranslationMs, setLastTranslationMs] = useState<number | null>(null);
  const [localPrediction, setLocalPrediction] = useState<LocalSignPrediction | null>(null);
  const [hasVisibleHand, setHasVisibleHand] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [serviceMode, setServiceMode] = useState<'hybrid' | 'local-fallback'>('hybrid');
  const [serviceNotice, setServiceNotice] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [continuousMode, setContinuousMode] = useState(() => localStorage.getItem('signtalk_continuous_translation') !== 'false');
  const [lsdModelStatus, setLsdModelStatus] = useState<'loading' | 'ready' | 'collecting' | 'inactive'>('loading');
  const [lsdModelVersion, setLsdModelVersion] = useState('');
  const [lsdModelExperimental, setLsdModelExperimental] = useState(false);

  useEffect(() => {
    localStorage.setItem('signtalk_continuous_translation', String(continuousMode));
  }, [continuousMode]);

  useEffect(() => {
    let active = true;
    lsdFramesRef.current = [];
    lsdSamplesRef.current = [];
    if (settings.signLanguageVariant !== 'LSD') {
      lsdModelRef.current = null;
      setLsdModelExperimental(false);
      setLsdModelStatus('inactive');
      return;
    }
    setLsdModelStatus('loading');
    void loadLsdModel().then((loaded) => {
      if (!active) return;
      lsdModelRef.current = loaded;
      setLsdModelVersion(loaded?.manifest.version || '');
      setLsdModelExperimental(Boolean(loaded?.manifest.experimental));
      setLsdModelStatus(loaded ? 'ready' : 'collecting');
    });
    return () => { active = false; };
  }, [settings.signLanguageVariant]);

  const drawLandmarks = useCallback((hands: NormalizedLandmark[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = `${activeTheme.primaryHex}dd`;
    context.fillStyle = activeTheme.primaryHex;
    context.lineWidth = settings.overlayStyle === 'minimal' ? 2 : 4;
    context.shadowColor = activeTheme.primaryHex;
    context.shadowBlur = settings.overlayStyle === 'glowing' ? 12 : 0;
    for (const hand of hands) {
      for (const [start, end] of HAND_CONNECTIONS) {
        context.beginPath();
        context.moveTo(hand[start].x * width, hand[start].y * height);
        context.lineTo(hand[end].x * width, hand[end].y * height);
        context.stroke();
      }
      for (const point of hand) {
        context.beginPath();
        context.arc(point.x * width, point.y * height, settings.overlayStyle === 'minimal' ? 3 : 5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }, [activeTheme.primaryHex, settings.overlayStyle]);

  useEffect(() => {
    let cancelled = false;
    const initializeTracking = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
        if (cancelled) return;
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        if (!cancelled) setTrackingReady(true);
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setError('No fue posible iniciar el seguimiento de manos.');
      }
    };
    void initializeTracking();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initializeCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unsupported');
        return;
      }
      setCameraState('starting');
      setError('');
      landmarksRef.current = [];
      const canvas = canvasRef.current;
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (canvasRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth || 1280;
            canvasRef.current.height = videoRef.current.videoHeight || 720;
          }
        }
        setCameraState('ready');
      } catch (cause) {
        console.error(cause);
        setCameraState(cause instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(cause.name) ? 'denied' : 'unsupported');
        setError('No fue posible iniciar esta cámara. Revisa los permisos del navegador.');
      }
    };
    void initializeCamera();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  useEffect(() => {
    if (cameraState !== 'ready' || !trackingReady) return;
    const detect = (timestamp: number) => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const interval = 1000 / Math.max(1, settings.cameraFPS);
      if (isCapturing && video?.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA && landmarker && timestamp - lastFrameRef.current >= interval) {
        lastFrameRef.current = timestamp;
        const result = landmarker.detectForVideo(video, timestamp);
        landmarksRef.current = result.landmarks;
        setHasVisibleHand(result.landmarks.length > 0);
        drawLandmarks(result.landmarks);
        if (settings.signLanguageVariant === 'LSD' && timestamp - lastLsdFrameRef.current >= 66) {
          lastLsdFrameRef.current = timestamp;
          if (result.landmarks.length) {
            lsdFramesRef.current = [...lsdFramesRef.current.slice(-47), {
              hands: result.landmarks,
              handedness: result.handednesses.map((categories) => categories[0]?.categoryName || 'Unknown'),
            }];
          } else {
            lsdFramesRef.current = [];
            lsdSamplesRef.current = [];
          }
          const loadedModel = lsdModelRef.current;
          if (loadedModel && lsdFramesRef.current.length >= 12 && !lsdInferenceRunningRef.current && timestamp - lastLsdInferenceRef.current >= 350) {
            lastLsdInferenceRef.current = timestamp;
            lsdInferenceRunningRef.current = true;
            const sequence = [...lsdFramesRef.current];
            void predictLsdSequence(loadedModel, sequence).then((modelPrediction) => {
              if (!modelPrediction || modelPrediction.code === 'none') {
                lsdSamplesRef.current = [];
                return;
              }
              const prediction: LocalSignPrediction = {
                label: modelPrediction.label,
                confidence: modelPrediction.confidence,
                detail: `Modelo LSD ${modelPrediction.version}`,
              };
              lsdSamplesRef.current = [...lsdSamplesRef.current.slice(-2), prediction];
              const matching = lsdSamplesRef.current.filter((sample) => sample.label === prediction.label);
              if (matching.length < 3) return;
              setLocalPrediction(prediction);
              const lastAdded = lastAutoAddedRef.current;
              const timestampNow = performance.now();
              const isNewTerm = !lastAdded || lastAdded.label !== prediction.label;
              const enoughTimePassed = !lastAdded || timestampNow - lastAdded.timestamp >= 1100;
              if (continuousMode && isNewTerm && enoughTimePassed) {
                addWordToSentence(prediction.label);
                lastAutoAddedRef.current = { label: prediction.label, timestamp: timestampNow };
                setDetection({ confidence: prediction.confidence, handDetails: `${prediction.detail} · Secuencia temporal` });
                setServiceNotice(`“${prediction.label}” se agregó con el modelo LSD entrenado.`);
                lsdSamplesRef.current = [];
                lsdFramesRef.current = [];
              }
            }).finally(() => { lsdInferenceRunningRef.current = false; });
          }
        }
        if (timestamp - lastLocalInferenceRef.current >= 220) {
          lastLocalInferenceRef.current = timestamp;
          const visibleHand = result.landmarks[0];
          if (visibleHand) {
            neutralSinceRef.current = null;
            localFramesRef.current = [...localFramesRef.current.slice(-7), { hand: visibleHand, timestamp }];
          } else {
            localFramesRef.current = [];
            neutralSinceRef.current ??= timestamp;
            if (timestamp - neutralSinceRef.current >= 550) lastAutoAddedRef.current = null;
          }
          const prediction = lsdModelRef.current ? null : visibleHand
            ? classifyLocalSignSequence(localFramesRef.current, settings.signLanguageVariant)
              || classifyLocalSign(visibleHand, settings.signLanguageVariant)
            : null;
          if (!prediction) {
            localSamplesRef.current = [];
          } else {
            localSamplesRef.current = [...localSamplesRef.current.slice(-5), prediction];
            const matching = localSamplesRef.current.filter((sample) => sample.label === prediction.label);
            const requiredMatches = prediction.detail.includes('movimiento') ? 2 : 5;
            if (matching.length >= requiredMatches) {
              const stablePrediction = {
                ...prediction,
                confidence: Math.min(0.97, matching.reduce((total, sample) => total + sample.confidence, 0) / matching.length + 0.02),
              };
              setLocalPrediction(stablePrediction);
              const lastAdded = lastAutoAddedRef.current;
              const isNewTerm = !lastAdded || lastAdded.label !== stablePrediction.label;
              const enoughTimePassed = !lastAdded || timestamp - lastAdded.timestamp >= 1100;
              if (continuousMode && stablePrediction.confidence >= 0.8 && isNewTerm && enoughTimePassed) {
                addWordToSentence(stablePrediction.label);
                lastAutoAddedRef.current = { label: stablePrediction.label, timestamp };
                setDetection({ confidence: stablePrediction.confidence, handDetails: `${stablePrediction.detail} · Captura continua ${settings.signLanguageVariant}` });
                setServiceNotice(`“${stablePrediction.label}” se agregó automáticamente. Baja las manos brevemente para repetirla.`);
                localSamplesRef.current = [];
              }
            }
          }
        }
        const labels = result.handednesses.flat().map((item) => item.categoryName);
        setDetection((previous) => ({ confidence: previous.confidence, handDetails: labels.length ? `${labels.join(' + ')} · ${result.landmarks.length * 21} puntos` : '' }));
      }
      animationRef.current = requestAnimationFrame(detect);
    };
    animationRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(animationRef.current);
  }, [cameraState, trackingReady, isCapturing, settings.cameraFPS, settings.signLanguageVariant, continuousMode, drawLandmarks, setDetection]);

  useEffect(() => {
    if (cooldownRemainingMs <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownRemainingMs(Math.max(0, 2500 - (Date.now() - lastGeminiRequestRef.current)));
    }, 100);
    return () => window.clearInterval(timer);
  }, [cooldownRemainingMs > 0]);

  const analyze = async () => {
    const video = videoRef.current;
    if (!video || !landmarksRef.current.length) {
      setError('Coloca al menos una mano visible frente a la cámara.');
      return;
    }
    const elapsed = Date.now() - lastGeminiRequestRef.current;
    if (elapsed < 2500) {
      setCooldownRemainingMs(2500 - elapsed);
      setServiceNotice('Espera un momento antes de solicitar otro análisis en la nube.');
      return;
    }
    lastGeminiRequestRef.current = Date.now();
    setCooldownRemainingMs(2500);
    setAnalyzing(true);
    setError('');
    const startedAt = performance.now();
    try {
      const capture = document.createElement('canvas');
      capture.width = Math.min(video.videoWidth, 640);
      capture.height = Math.round(capture.width * video.videoHeight / video.videoWidth);
      capture.getContext('2d')?.drawImage(video, 0, 0, capture.width, capture.height);
      const compactLandmarks = landmarksRef.current.map((hand) => hand.map((point) => ({
        x: Math.round(point.x * 10_000) / 10_000,
        y: Math.round(point.y * 10_000) / 10_000,
        z: Math.round(point.z * 10_000) / 10_000,
      })));
      const response = await fetch('/api/translate-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ imageData: capture.toDataURL('image/jpeg', 0.68), landmarkData: compactLandmarks, currentSentence: activeSentence.join(' ').slice(-300), targetLanguage: settings.language === 'es' ? 'Spanish' : 'English', variant: settings.signLanguageVariant }),
      });
      const data = await response.json();
      if ([429, 503].includes(response.status)) {
        setServiceMode('local-fallback');
        setServiceNotice('Servicio saturado: cambiando temporalmente a modo de detección local.');
        triggerHaptic('warning', settings.hapticFeedback);
        return;
      }
      if (!response.ok || !data.success) throw new Error(data.error || 'Gemini no pudo analizar la seña.');
      setLastTranslationMs(performance.now() - startedAt);
      setServiceMode('hybrid');
      setServiceNotice('Análisis en la nube completado. La detección local continúa activa.');
      addWordToSentence(data.translation);
      setDetection({ confidence: typeof data.confidence === 'number' ? data.confidence : detection.confidence, handDetails: data.detectedHand || detection.handDetails });
    } catch (cause) {
      if (cause instanceof TypeError) {
        setServiceMode('local-fallback');
        setServiceNotice('Sin conexión con Gemini: puedes continuar con la detección local.');
        triggerHaptic('warning', settings.hapticFeedback);
      } else {
        setError(cause instanceof Error ? cause.message : 'No se pudo analizar la seña.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const useLocalPrediction = () => {
    if (!localPrediction) return;
    addWordToSentence(localPrediction.label);
    setDetection({ confidence: localPrediction.confidence, handDetails: `${localPrediction.detail} · Procesado en el dispositivo` });
    setServiceNotice(`“${localPrediction.label}” se agregó usando detección local.`);
    setLocalPrediction(null);
    localSamplesRef.current = [];
  };

  const copy = async () => {
    await navigator.clipboard.writeText(activeSentence.join(' '));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-4 px-3 pt-4 pb-28 sm:gap-5 sm:p-6 sm:pb-28">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <section className="min-w-0">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-slate-950 shadow-xl sm:aspect-video">
            <video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${facingMode === 'user' ? '-scale-x-100' : ''}`} />
            <canvas ref={canvasRef} width={1280} height={720} className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${facingMode === 'user' ? '-scale-x-100' : ''}`} />
            <div className="absolute inset-x-3 top-3 flex min-w-0 flex-wrap gap-1.5 sm:left-4 sm:right-auto sm:top-4 sm:gap-2">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"><Activity className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />{trackingReady ? `${landmarksRef.current.length} mano(s)` : 'Cargando MediaPipe'}</span>
              {settings.signLanguageVariant === 'LSD' && <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">{lsdModelStatus === 'ready' ? `LSD IA${lsdModelExperimental ? ' experimental' : ''} ${lsdModelVersion.slice(0, 8)}` : lsdModelStatus === 'loading' ? 'Cargando modelo LSD' : 'LSD en recopilación'}</span>}
              {localPrediction && <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">Local {Math.round(localPrediction.confidence * 100)}%</span>}
            </div>
            {cameraState !== 'ready' && <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-8 text-center text-white">{cameraState === 'starting' ? <div><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" /><p>Iniciando cámara y seguimiento…</p></div> : <div><AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-400" /><p>{cameraState === 'denied' ? 'Permite el acceso a la cámara en tu navegador y recarga la página.' : 'Este navegador no puede iniciar la cámara o MediaPipe.'}</p></div>}</div>}
            <button onClick={() => setIsCapturing(!isCapturing)} disabled={cameraState !== 'ready'} className="absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-2 text-xs font-black text-slate-900 backdrop-blur disabled:opacity-50 sm:bottom-4 sm:left-4 sm:px-4"><Camera className="mr-1 inline h-4 w-4 sm:mr-1.5" />{isCapturing ? 'Pausar' : 'Reanudar'}</button>
            <button onClick={() => setFacingMode((current) => current === 'environment' ? 'user' : 'environment')} disabled={cameraState === 'starting' || analyzing} className="absolute right-3 bottom-3 rounded-xl bg-white/90 px-3 py-2 text-xs font-black text-slate-900 backdrop-blur disabled:opacity-50 sm:right-4 sm:bottom-4 sm:px-4" title="Cambiar cámara"><SwitchCamera className="mr-1 inline h-4 w-4 sm:mr-1.5" />{facingMode === 'environment' ? 'Trasera' : 'Frontal'}</button>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5">
              <div>
                <p className="text-xs font-black text-emerald-900">Traducción continua</p>
                <p className="text-[11px] text-emerald-700">Agrega señas estables sin tocar la pantalla</p>
              </div>
              <button type="button" role="switch" aria-checked={continuousMode} onClick={() => setContinuousMode((current) => !current)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${continuousMode ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${continuousMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500"><Smartphone className="h-4 w-4 text-emerald-600" />Detección local</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{localPrediction ? `${localPrediction.label} · ${localPrediction.detail}` : 'Mantén una seña simple estable frente a la cámara'}</p>
                {localPrediction && !hasVisibleHand && <p className="mt-1 text-xs font-semibold text-emerald-700">Resultado retenido: puedes bajar las manos sin perderlo.</p>}
              </div>
              {!continuousMode && <button onClick={useLocalPrediction} disabled={!localPrediction} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Usar</button>}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((localPrediction?.confidence || 0) * 100)}%` }} /></div>
            <p className="mt-1 text-right text-[11px] font-bold text-slate-500">{localPrediction ? `${Math.round(localPrediction.confidence * 100)}% de certeza · ${hasVisibleHand ? 'Seña estable' : 'Retenida'}` : 'Analizando en el dispositivo'}</p>
          </div>
          {serviceNotice && <p role="status" className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm ${serviceMode === 'local-fallback' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{serviceMode === 'local-fallback' && <WifiOff className="h-4 w-4 shrink-0" />}{serviceNotice}</p>}
          {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {GEMINI_ANALYSIS_ENABLED && <button onClick={() => void analyze()} disabled={analyzing || cooldownRemainingMs > 0 || cameraState !== 'ready' || !isCapturing} className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">{analyzing ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Analizando fotograma real…</> : cooldownRemainingMs > 0 ? `Disponible en ${(cooldownRemainingMs / 1000).toFixed(1)} s` : 'Analizar seña con Gemini'}</button>}
          <p className="mt-3 text-center text-xs text-slate-500">Las señas se procesan directamente en este dispositivo · Variante {settings.signLanguageVariant}{GEMINI_ANALYSIS_ENABLED && lastTranslationMs !== null ? ` · Último análisis: ${(lastTranslationMs / 1000).toFixed(1)} s` : ''}</p>
        </section>

        <section className="flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Traducción</p><p className="mt-1 text-xs text-slate-500">{detection.handDetails || 'Esperando una mano visible'}</p></div><div className="flex gap-1"><button onClick={removeLastWord} className="rounded-lg p-2 hover:bg-slate-100" title="Deshacer"><RotateCcw className="h-4 w-4" /></button><button onClick={clearSentence} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" title="Limpiar"><Trash2 className="h-4 w-4" /></button></div></div>
          {detection.confidence != null && <div className="mt-4"><div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500"><span>Nivel de certeza</span><span>{Math.round(detection.confidence * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.round(detection.confidence * 100)}%` }} /></div></div>}
          <div className="flex min-h-44 min-w-0 flex-1 items-center"><p className={`${activeSentence.length ? 'text-2xl font-black leading-relaxed text-slate-900' : 'text-sm text-slate-400'} min-w-0 break-words [overflow-wrap:anywhere]`}>{activeSentence.length ? activeSentence.join(' ') : 'La traducción reconocida aparecerá aquí.'}</p></div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => void commitSentenceToHistory().catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'))} disabled={!activeSentence.length} className="rounded-xl bg-slate-900 px-3 py-3 text-xs font-bold text-white disabled:opacity-40"><Send className="mr-1 inline h-4 w-4" />Guardar</button>
            <button onClick={() => speakPhrase(activeSentence.join(' '))} disabled={!activeSentence.length} className="rounded-xl bg-slate-100 p-3 disabled:opacity-40" title="Escuchar"><Volume2 className={`h-4 w-4 ${isSpeaking ? 'animate-pulse' : ''}`} /></button>
            <button onClick={() => void copy()} disabled={!activeSentence.length} className="rounded-xl bg-slate-100 p-3 disabled:opacity-40" title="Copiar">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
          </div>
        </section>
      </div>
    </div>
  );
};
