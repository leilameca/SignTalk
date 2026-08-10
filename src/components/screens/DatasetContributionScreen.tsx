import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { ArrowLeft, Camera, CheckCircle2, Database, Loader2, RotateCcw, ShieldCheck, SwitchCamera, Trash2, Upload, WifiOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  clearQueuedSignRecordings,
  listQueuedSignRecordings,
  queueSignRecording,
  removeQueuedSignRecording,
  type DatasetParticipantPayload,
  type QueuedSignRecording,
} from '../../utils/datasetQueue';

interface SignLabel {
  code: string;
  display_name: string;
  motion_type: 'static' | 'dynamic' | 'two_hand';
}

interface LandmarkFrame {
  timestampMs: number;
  hands: Array<Array<{ x: number; y: number; z: number }>>;
  handedness: string[];
}

interface CapturedClip {
  blob: Blob;
  extension: 'webm' | 'mp4';
  contentType: string;
  frames: LandmarkFrame[];
  durationMs: number;
}

const CONSENT_VERSION = 'dataset-lsd-v1-2026-08';
const PARTICIPANT_STORAGE_KEY = 'signtalk_dataset_participant';
const FALLBACK_LABELS: SignLabel[] = [
  ['hola', 'Hola', 'dynamic'], ['gracias', 'Gracias', 'dynamic'], ['por_favor', 'Por favor', 'dynamic'],
  ['si', 'Sí', 'dynamic'], ['no', 'No', 'dynamic'], ['ayuda', 'Ayuda', 'two_hand'], ['bano', 'Baño', 'dynamic'],
  ['agua', 'Agua', 'dynamic'], ['comer', 'Comer', 'dynamic'], ['dolor', 'Dolor', 'dynamic'],
  ['te_quiero', 'Te quiero', 'static'], ['none', 'Ninguna / movimiento neutral', 'dynamic'],
].map(([code, display_name, motion_type]) => ({ code, display_name, motion_type: motion_type as SignLabel['motion_type'] }));

const compactHands = (hands: NormalizedLandmark[][]) => hands.map((hand) => hand.map((point) => ({
  x: Math.round(point.x * 10_000) / 10_000,
  y: Math.round(point.y * 10_000) / 10_000,
  z: Math.round(point.z * 10_000) / 10_000,
})));

export const DatasetContributionScreen: React.FC = () => {
  const { setActiveTab } = useApp();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animationRef = useRef(0);
  const recordingRef = useRef(false);
  const recordingStartedRef = useRef(0);
  const lastLandmarkFrameRef = useRef(0);
  const framesRef = useRef<LandmarkFrame[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const [participant, setParticipant] = useState<DatasetParticipantPayload | null>(null);
  const [pseudonym, setPseudonym] = useState('Participante LSD');
  const [dominantHand, setDominantHand] = useState<'right' | 'left' | 'both'>('right');
  const [isAdult, setIsAdult] = useState(false);
  const [consentResearch, setConsentResearch] = useState(false);
  const [consentProduct, setConsentProduct] = useState(false);
  const [labels, setLabels] = useState<SignLabel[]>(FALLBACK_LABELS);
  const [selectedLabel, setSelectedLabel] = useState('hola');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [trackingReady, setTrackingReady] = useState(false);
  const [handCount, setHandCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [captured, setCaptured] = useState<CapturedClip | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedConsent, setApprovedConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const refreshPendingCount = useCallback(async () => {
    if (!user) return;
    try { setPendingCount((await listQueuedSignRecordings(user.id)).length); }
    catch { setPendingCount(0); }
  }, [user]);

  const uploadRecording = useCallback(async (item: QueuedSignRecording) => {
    const { error: participantError } = await supabase.from('dataset_participants').upsert(item.participant, { onConflict: 'user_id' });
    if (participantError) throw participantError;

    const { data: label, error: labelError } = await supabase.from('sign_labels').select('id').eq('code', item.labelCode).eq('variant', item.variant).eq('active', true).single();
    if (labelError || !label) throw labelError || new Error('La etiqueta ya no está disponible.');

    const day = item.createdAt.slice(0, 10);
    const storagePath = `${item.userId}/${day}/${item.id}.${item.extension}`;
    const { data: alreadyUploaded } = await supabase.storage.from('sign-dataset').exists(storagePath);
    if (!alreadyUploaded) {
      const { error: uploadError } = await supabase.storage.from('sign-dataset').upload(storagePath, item.blob, {
        contentType: item.contentType,
        cacheControl: '0',
        upsert: false,
      });
      if (uploadError) throw uploadError;
    }

    const { data: existing } = await supabase.from('sign_recordings').select('id').eq('id', item.id).maybeSingle();
    if (!existing) {
      const { error: recordingError } = await supabase.from('sign_recordings').insert({
        id: item.id,
        user_id: item.userId,
        participant_id: item.participant.id,
        label_id: label.id,
        storage_path: storagePath,
        landmark_sequence: item.landmarkSequence,
        duration_ms: item.durationMs,
        frame_count: item.frameCount,
        camera_facing: item.cameraFacing,
      });
      if (recordingError) {
        await supabase.storage.from('sign-dataset').remove([storagePath]);
        throw recordingError;
      }
    }
  }, []);

  const syncPending = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    const pending = await listQueuedSignRecordings(user.id);
    if (!pending.length) return;
    setBusy(true);
    let synced = 0;
    for (const item of pending) {
      try {
        await uploadRecording(item);
        await removeQueuedSignRecording(item.id);
        synced += 1;
      } catch {
        // Keep the item in IndexedDB for the next connection attempt.
      }
    }
    await refreshPendingCount();
    setBusy(false);
    if (synced) setStatus(`${synced} grabación(es) pendiente(s) sincronizada(s).`);
  }, [refreshPendingCount, uploadRecording, user]);

  useEffect(() => {
    if (!user) return;
    void refreshPendingCount();
    try {
      const local = JSON.parse(localStorage.getItem(`${PARTICIPANT_STORAGE_KEY}:${user.id}`) || 'null') as DatasetParticipantPayload | null;
      if (local?.user_id === user.id && !local.withdrawn_at) setParticipant(local);
    } catch { /* Ignore malformed local consent. */ }
    void supabase.from('dataset_participants').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data && !data.withdrawn_at) {
        const saved = data as DatasetParticipantPayload;
        setParticipant(saved);
        localStorage.setItem(`${PARTICIPANT_STORAGE_KEY}:${user.id}`, JSON.stringify(saved));
      }
    });
    void supabase.from('sign_labels').select('code,display_name,motion_type').eq('variant', 'LSD').eq('active', true).order('display_name').then(({ data }) => {
      if (data?.length) setLabels(data as SignLabel[]);
    });
  }, [refreshPendingCount, user]);

  useEffect(() => {
    const online = () => void syncPending();
    window.addEventListener('online', online);
    if (navigator.onLine) void syncPending();
    return () => window.removeEventListener('online', online);
  }, [syncPending]);

  useEffect(() => {
    if (!participant) return;
    let cancelled = false;
    const start = async () => {
      setCameraReady(false);
      setTrackingReady(false);
      setError('');
      try {
        const [vision, stream] = await Promise.all([
          FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
        ]);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        try {
          landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.65, minTrackingConfidence: 0.65,
          });
        } catch {
          landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
            runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.65, minTrackingConfidence: 0.65,
          });
        }
        setCameraReady(true);
        setTrackingReady(true);

        const detect = (timestamp: number) => {
          const video = videoRef.current;
          const landmarker = landmarkerRef.current;
          if (video?.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA && landmarker) {
            const result = landmarker.detectForVideo(video, timestamp);
            setHandCount(result.landmarks.length);
            if (recordingRef.current && timestamp - lastLandmarkFrameRef.current >= 66) {
              lastLandmarkFrameRef.current = timestamp;
              framesRef.current.push({
                timestampMs: Math.round(timestamp - recordingStartedRef.current),
                hands: compactHands(result.landmarks),
                handedness: result.handednesses.map((categories) => categories[0]?.categoryName || 'Unknown'),
              });
            }
          }
          animationRef.current = requestAnimationFrame(detect);
        };
        animationRef.current = requestAnimationFrame(detect);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No fue posible iniciar la cámara.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationRef.current);
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      recordingRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [facingMode, participant]);

  useEffect(() => {
    if (!captured) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(captured.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captured]);

  const submitConsent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !isAdult || !consentResearch || !consentProduct || pseudonym.trim().length < 2) return;
    const saved: DatasetParticipantPayload = {
      id: crypto.randomUUID(), user_id: user.id, pseudonym: pseudonym.trim(), dominant_hand: dominantHand,
      country_code: 'DO', is_adult: true, consent_version: CONSENT_VERSION, consent_research: true,
      consent_product: true, consented_at: new Date().toISOString(), withdrawn_at: null,
    };
    localStorage.setItem(`${PARTICIPANT_STORAGE_KEY}:${user.id}`, JSON.stringify(saved));
    setParticipant(saved);
    setStatus('Consentimiento guardado. Ya puedes contribuir grabaciones.');
    if (navigator.onLine) {
      const { error: consentError } = await supabase.from('dataset_participants').upsert(saved, { onConflict: 'user_id' });
      if (consentError) setStatus('Consentimiento guardado en el dispositivo; se sincronizará con tu primera grabación.');
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || !cameraReady || recording || !selectedLabel || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite iniciar la grabación de video.');
      return;
    }
    const supportedMime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
    const recorder = new MediaRecorder(stream, { ...(supportedMime ? { mimeType: supportedMime } : {}), videoBitsPerSecond: 900_000 });
    const chunks: BlobPart[] = [];
    framesRef.current = [];
    recordingStartedRef.current = performance.now();
    lastLandmarkFrameRef.current = 0;
    recordingRef.current = true;
    setCaptured(null);
    setApprovedConsent(false);
    setError('');
    setStatus('Mantén la seña completa y visible durante 3 segundos.');
    setRecording(true);
    setSecondsRemaining(3);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      recordingRef.current = false;
      setRecording(false);
      setSecondsRemaining(0);
      const contentType = (recorder.mimeType || supportedMime || 'video/webm').split(';')[0];
      const frames = framesRef.current.filter((frame) => frame.hands.length > 0);
      if (frames.length < 8) {
        setError('No se detectaron suficientes fotogramas con las manos visibles. Repite la grabación.');
        return;
      }
      setCaptured({ blob: new Blob(chunks, { type: contentType }), extension: contentType.includes('mp4') ? 'mp4' : 'webm', contentType, frames, durationMs: 3000 });
      setStatus('Grabación lista. Revísala antes de enviarla.');
    };
    recorder.start(200);
    const countdown = window.setInterval(() => setSecondsRemaining((value) => Math.max(0, value - 1)), 1000);
    stopTimerRef.current = window.setTimeout(() => {
      window.clearInterval(countdown);
      if (recorder.state === 'recording') recorder.stop();
    }, 3000);
  };

  const saveCapture = async () => {
    if (!captured || !participant || !user) return;
    setBusy(true);
    setError('');
    const item: QueuedSignRecording = {
      id: crypto.randomUUID(), userId: user.id, participant, labelCode: selectedLabel, variant: 'LSD',
      blob: captured.blob, extension: captured.extension, contentType: captured.contentType,
      landmarkSequence: captured.frames, durationMs: captured.durationMs, frameCount: captured.frames.length,
      cameraFacing: facingMode, createdAt: new Date().toISOString(),
    };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await uploadRecording(item);
      setStatus('Grabación enviada de forma privada para revisión. ¡Gracias!');
    } catch {
      await queueSignRecording(item);
      setStatus('Grabación guardada en este dispositivo. Se enviará automáticamente cuando haya Internet.');
    }
    setCaptured(null);
    setApprovedConsent(false);
    setBusy(false);
    await refreshPendingCount();
  };

  const withdrawConsent = async () => {
    if (!user || !participant || !navigator.onLine || !window.confirm('¿Deseas retirar tu consentimiento y eliminar todas tus grabaciones aportadas?')) return;
    setBusy(true);
    const { data } = await supabase.from('sign_recordings').select('storage_path').eq('user_id', user.id);
    const paths = (data || []).map((row) => row.storage_path as string);
    if (paths.length) await supabase.storage.from('sign-dataset').remove(paths);
    await supabase.from('sign_recordings').delete().eq('user_id', user.id);
    await supabase.from('dataset_participants').update({ withdrawn_at: new Date().toISOString() }).eq('user_id', user.id);
    await clearQueuedSignRecordings(user.id);
    localStorage.removeItem(`${PARTICIPANT_STORAGE_KEY}:${user.id}`);
    setParticipant(null);
    setPendingCount(0);
    setBusy(false);
    setStatus('Consentimiento retirado y aportes eliminados.');
  };

  if (!participant) {
    return <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4 pb-28 sm:p-6">
      <button onClick={() => setActiveTab('settings')} className="flex w-fit items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Volver a Ajustes</button>
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-7">
        <ShieldCheck className="h-9 w-9 text-emerald-700" /><h2 className="mt-3 text-xl font-black text-slate-900">Consentimiento para contribuir señas</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Tus clips, movimientos de manos y un alias se usarán para investigar, entrenar y mejorar el reconocimiento LSD de SignTalk. El bucket es privado, no publicaremos los videos y puedes retirar tus aportes.</p>
      </section>
      <form onSubmit={submitConsent} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <label className="block text-sm font-bold text-slate-700">Alias del participante<input value={pseudonym} onChange={(event) => setPseudonym(event.target.value)} minLength={2} maxLength={50} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal" /></label>
        <label className="block text-sm font-bold text-slate-700">Mano dominante<select value={dominantHand} onChange={(event) => setDominantHand(event.target.value as typeof dominantHand)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal"><option value="right">Derecha</option><option value="left">Izquierda</option><option value="both">Ambidiestra</option></select></label>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={isAdult} onChange={(event) => setIsAdult(event.target.checked)} className="mt-1" /><span>Confirmo que tengo 18 años o más y participo voluntariamente.</span></label>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={consentResearch} onChange={(event) => setConsentResearch(event.target.checked)} className="mt-1" /><span>Autorizo el uso de estos datos para investigación y evaluación del reconocimiento de señas.</span></label>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={consentProduct} onChange={(event) => setConsentProduct(event.target.checked)} className="mt-1" /><span>Autorizo el uso de estos datos para entrenar modelos integrados en SignTalk.</span></label>
        <button disabled={!isAdult || !consentResearch || !consentProduct || pseudonym.trim().length < 2} className="w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-40">Aceptar y continuar</button>
      </form>
      {status && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{status}</p>}
    </div>;
  }

  const selected = labels.find((label) => label.code === selectedLabel);
  return <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col gap-4 p-3 pb-28 sm:p-6 sm:pb-28">
    <div className="flex flex-wrap items-center justify-between gap-3"><button onClick={() => setActiveTab('settings')} className="flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Volver</button><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Alias: {participant.pseudonym}</span></div>
    {pendingCount > 0 && <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800"><WifiOff className="h-4 w-4" />{pendingCount} grabación(es) esperando sincronización.</div>}
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
      <section className="min-w-0">
        <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-slate-950 sm:aspect-video"><video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${facingMode === 'user' ? '-scale-x-100' : ''}`} />
          {!cameraReady && <div className="absolute inset-0 grid place-items-center text-sm font-bold text-white"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Preparando cámara…</div>}
          <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">{trackingReady ? `${handCount} mano(s)` : 'Cargando MediaPipe'}</span>
          {recording && <div className="absolute inset-0 grid place-items-center bg-rose-950/20"><span className="rounded-full bg-rose-600 px-5 py-3 text-lg font-black text-white shadow-lg">● REC · {secondsRemaining}s</span></div>}
          <button onClick={() => setFacingMode((value) => value === 'environment' ? 'user' : 'environment')} disabled={recording || busy} className="absolute right-3 bottom-3 rounded-xl bg-white/90 px-3 py-2 text-xs font-black text-slate-900"><SwitchCamera className="mr-1 inline h-4 w-4" />{facingMode === 'environment' ? 'Trasera' : 'Frontal'}</button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {status && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{status}</p>}
      </section>
      <section className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Etiqueta LSD</p><select value={selectedLabel} onChange={(event) => { setSelectedLabel(event.target.value); setCaptured(null); }} disabled={recording || busy} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold">{labels.map((label) => <option key={label.code} value={label.code}>{label.display_name}</option>)}</select><p className="mt-2 text-xs text-slate-500">Tipo: {selected?.motion_type === 'two_hand' ? 'dos manos' : selected?.motion_type === 'dynamic' ? 'con movimiento' : 'estática'}</p></div>
        <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600"><strong className="text-slate-900">Cómo grabar:</strong> muestra la seña completa, deja ambas manos dentro del encuadre y evita que otra persona aparezca en el video.</div>
        {!captured ? <button onClick={startRecording} disabled={!cameraReady || recording || busy} className="w-full rounded-2xl bg-rose-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-40"><Camera className="mr-2 inline h-4 w-4" />{recording ? 'Grabando…' : 'Grabar ejemplo de 3 segundos'}</button> : <div className="space-y-3"><video src={previewUrl} controls playsInline className="aspect-video w-full rounded-2xl bg-black object-contain" /><p className="text-xs font-semibold text-slate-600">{captured.frames.length} fotogramas útiles con manos detectadas.</p><div className="grid grid-cols-2 gap-2"><button onClick={() => setCaptured(null)} disabled={busy} className="rounded-xl bg-slate-100 px-3 py-3 text-xs font-black text-slate-700"><RotateCcw className="mr-1 inline h-4 w-4" />Repetir</button><button onClick={() => void saveCapture()} disabled={busy || !approvedConsent} className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white disabled:opacity-40">{busy ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Upload className="mr-1 inline h-4 w-4" />}Enviar</button></div><label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900"><input type="checkbox" checked={approvedConsent} onChange={(event) => setApprovedConsent(event.target.checked)} className="mt-0.5" /><span>Confirmo que la etiqueta es correcta y que deseo aportar esta grabación.</span></label></div>}
        <div className="border-t border-slate-100 pt-4"><p className="flex items-center gap-2 text-xs font-bold text-slate-600"><Database className="h-4 w-4" />Los videos se almacenan en un bucket privado.</p><button onClick={() => void syncPending()} disabled={!pendingCount || busy || !navigator.onLine} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold disabled:opacity-40"><CheckCircle2 className="mr-1 inline h-4 w-4" />Sincronizar pendientes</button><button onClick={() => void withdrawConsent()} disabled={busy || !navigator.onLine} className="mt-2 w-full rounded-xl px-3 py-2.5 text-xs font-bold text-rose-600 disabled:opacity-40"><Trash2 className="mr-1 inline h-4 w-4" />Retirar consentimiento y borrar aportes</button></div>
      </section>
    </div>
  </div>;
};
