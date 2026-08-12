import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Download, Loader2, Play, RefreshCw, Rocket, Save, ShieldCheck, SlidersHorizontal, TriangleAlert, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface ReviewRecording {
  id: string;
  participant_id: string;
  storage_path: string;
  duration_ms: number;
  frame_count: number;
  camera_facing: 'user' | 'environment';
  status: ReviewStatus;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  sign_labels: { code: string; display_name: string; variant: 'LSD' | 'ASL'; motion_type: string } | null;
  dataset_participants: { pseudonym: string; dominant_hand: string; country_code: string } | null;
}

interface TrainingSettings {
  variant: 'LSD';
  minimum_samples: number;
  minimum_participants: number;
  minimum_macro_f1: number;
  minimum_class_recall: number;
  confidence_threshold: number;
  allow_experimental: boolean;
}

interface LsdModelManifestSummary {
  available: boolean;
  version: string;
  variant: 'LSD';
  labels: Array<{ code: string; displayName: string }>;
  metrics: { macroF1: number; minimumClassRecall: number; testSamples: number; samples?: number; participants?: number; minimumParticipantsPerClass?: number; bodyContextSamples?: number } | null;
  trainedAt: string | null;
  evaluationMode?: string;
}

interface TrainingRunStatus {
  id: number;
  status: string;
  conclusion: string | null;
  runUrl: string;
  createdAt: string;
  updatedAt: string;
  commit: string;
}

interface LsdSignLabel {
  code: string;
  display_name: string;
}

interface SignLabelProposal {
  id: string;
  user_id: string;
  display_name: string;
  motion_type: 'static' | 'dynamic' | 'two_hand';
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
}

const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  variant: 'LSD', minimum_samples: 1, minimum_participants: 1,
  minimum_macro_f1: 0.70, minimum_class_recall: 0.45,
  confidence_threshold: 0.68, allow_experimental: true,
};

const statusLabel: Record<ReviewStatus, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };

export const AdminDatasetScreen: React.FC = () => {
  const { setActiveTab } = useApp();
  const { user, isAdmin, adminLoading } = useAuth();
  const [recordings, setRecordings] = useState<ReviewRecording[]>([]);
  const [filter, setFilter] = useState<ReviewStatus>('pending');
  const [selected, setSelected] = useState<ReviewRecording | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishNotice, setPublishNotice] = useState('');
  const [trainingSettings, setTrainingSettings] = useState<TrainingSettings>(DEFAULT_TRAINING_SETTINGS);
  const [modelStatus, setModelStatus] = useState<LsdModelManifestSummary | null>(null);
  const [trainingRun, setTrainingRun] = useState<TrainingRunStatus | null>(null);
  const [signLabels, setSignLabels] = useState<LsdSignLabel[]>([]);
  const [labelProposals, setLabelProposals] = useState<SignLabelProposal[]>([]);
  const [proposalReviewing, setProposalReviewing] = useState('');
  const [error, setError] = useState('');

  const loadRecordings = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    const [recordingsResult, settingsResult, labelsResult, proposalsResult] = await Promise.all([
      supabase.from('sign_recordings').select('id,participant_id,storage_path,duration_ms,frame_count,camera_facing,status,rejection_reason,reviewed_at,created_at,sign_labels(code,display_name,variant,motion_type),dataset_participants(pseudonym,dominant_hand,country_code)').order('created_at', { ascending: false }),
      supabase.from('model_training_settings').select('variant,minimum_samples,minimum_participants,minimum_macro_f1,minimum_class_recall,confidence_threshold,allow_experimental').eq('variant', 'LSD').single(),
      supabase.from('sign_labels').select('code,display_name').eq('variant', 'LSD').eq('active', true).order('display_name'),
      supabase.from('sign_label_proposals').select('id,user_id,display_name,motion_type,status,rejection_reason,created_at').eq('variant', 'LSD').order('created_at', { ascending: false }),
    ]);
    if (recordingsResult.error) setError('No se pudieron cargar las muestras. Verifica que la migración de administración esté aplicada.');
    else setRecordings((recordingsResult.data || []) as unknown as ReviewRecording[]);
    if (!settingsResult.error && settingsResult.data) setTrainingSettings(settingsResult.data as TrainingSettings);
    if (!labelsResult.error) setSignLabels((labelsResult.data || []) as LsdSignLabel[]);
    if (!proposalsResult.error) setLabelProposals((proposalsResult.data || []) as SignLabelProposal[]);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void loadRecordings(); }, [loadRecordings]);

  useEffect(() => {
    let cancelled = false;
    const loadManifest = () => fetch(`/models/lsd/manifest.json?check=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('manifest unavailable');
        const manifest = await response.json() as LsdModelManifestSummary;
        if (!cancelled) setModelStatus(manifest);
      })
      .catch(() => undefined);
    void loadManifest();
    const manifestRefresh = window.setInterval(() => void loadManifest(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(manifestRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const loadTrainingRun = async () => {
      const token = await supabase.auth.getSession().then(({ data }) => data.session?.access_token || '');
      if (!token) return;
      const response = await fetch('/api/admin/lsd-model-run', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as { run?: TrainingRunStatus };
      if (!cancelled && response.ok) setTrainingRun(payload.run || null);
    };
    void loadTrainingRun();
    const interval = window.setInterval(() => void loadTrainingRun(), 20_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isAdmin]);

  const openRecording = async (recording: ReviewRecording) => {
    setSelected(recording);
    setReason(recording.rejection_reason || '');
    setVideoUrl('');
    setVideoError(false);
    setPreviewLoading(true);
    setError('');
    const { data, error: signedUrlError } = await supabase.storage.from('sign-dataset').createSignedUrl(recording.storage_path, 300);
    if (signedUrlError) setError('No fue posible abrir el video privado.');
    else setVideoUrl(data.signedUrl);
    setPreviewLoading(false);
  };

  const review = async (status: 'approved' | 'rejected') => {
    if (!selected || !user) return;
    if (status === 'rejected' && reason.trim().length < 3) {
      setError('Escribe una razón breve para rechazar esta muestra.');
      return;
    }
    setSaving(true);
    setError('');
    const reviewedAt = new Date().toISOString();
    const rejectionReason = status === 'rejected' ? reason.trim() : null;
    const { error: updateError } = await supabase.from('sign_recordings').update({
      status,
      rejection_reason: rejectionReason,
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
    }).eq('id', selected.id);
    if (updateError) setError('No se pudo guardar la revisión. Tu sesión puede haber expirado.');
    else {
      setRecordings((current) => current.map((item) => item.id === selected.id ? { ...item, status, rejection_reason: rejectionReason, reviewed_at: reviewedAt } : item));
      setSelected(null);
      setVideoUrl('');
      setReason('');
    }
    setSaving(false);
  };

  const saveTrainingSettings = async () => {
    if (!user) return;
    setTrainingSaving(true);
    setError('');
    const { error: settingsError } = await supabase.from('model_training_settings').update({
      minimum_samples: trainingSettings.minimum_samples,
      minimum_participants: trainingSettings.minimum_participants,
      minimum_macro_f1: trainingSettings.minimum_macro_f1,
      minimum_class_recall: trainingSettings.minimum_class_recall,
      confidence_threshold: trainingSettings.confidence_threshold,
      allow_experimental: trainingSettings.allow_experimental,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq('variant', 'LSD');
    if (settingsError) setError('No se pudo guardar la configuración de entrenamiento.');
    setTrainingSaving(false);
  };

  const publishModel = async () => {
    if (!user) return;
    setPublishSaving(true);
    setError('');
    setPublishNotice('');
    try {
      const response = await fetch('/api/admin/publish-lsd-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await supabase.auth.getSession().then(({ data }) => data.session?.access_token || '')}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo disparar la publicación.');
      setError('');
      setPublishNotice(payload.alreadyRunning ? 'Ya existe un entrenamiento en curso.' : 'Entrenamiento enviado. El estado del modelo se actualizará automáticamente cuando termine.');
      setModelStatus((current) => current ? { ...current, version: 'pending' } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo disparar la publicación.');
    }
    setPublishSaving(false);
  };

  const reviewLabelProposal = async (proposal: SignLabelProposal, decision: 'approved' | 'rejected') => {
    const rejectionReason = decision === 'rejected' ? (window.prompt('Escribe una razón breve para rechazar esta propuesta:')?.trim() ?? null) : null;
    if (decision === 'rejected' && (!rejectionReason || rejectionReason.length < 3)) return;
    setProposalReviewing(proposal.id);
    setError('');
    const { error: reviewError } = await supabase.rpc('review_sign_label_proposal', {
      proposal_id: proposal.id,
      decision,
      reason: rejectionReason,
    });
    if (reviewError) setError('No se pudo revisar la propuesta de palabra o frase.');
    else {
      setLabelProposals((current) => current.map((item) => item.id === proposal.id ? { ...item, status: decision, rejection_reason: rejectionReason } : item));
      if (decision === 'approved') await loadRecordings();
    }
    setProposalReviewing('');
  };

  const counts = useMemo(() => recordings.reduce((result, item) => ({ ...result, [item.status]: result[item.status] + 1 }), { pending: 0, approved: 0, rejected: 0 }), [recordings]);
  const visible = useMemo(() => recordings.filter((item) => item.status === filter), [recordings, filter]);
  const trainingReadiness = useMemo(() => {
    const groups = new Map<string, { label: string; samples: number; participants: Set<string> }>();
    signLabels.forEach((label) => groups.set(label.code, { label: label.display_name, samples: 0, participants: new Set<string>() }));
    recordings.filter((item) => item.status === 'approved').forEach((item) => {
      const code = item.sign_labels?.code || 'unknown';
      const current = groups.get(code) || { label: item.sign_labels?.display_name || code, samples: 0, participants: new Set<string>() };
      current.samples += 1;
      current.participants.add(item.participant_id);
      groups.set(code, current);
    });
    return [...groups.entries()].map(([code, value]) => ({ code, label: value.label, samples: value.samples, participants: value.participants.size, ready: value.samples >= trainingSettings.minimum_samples && value.participants.size >= trainingSettings.minimum_participants })).sort((a, b) => a.label.localeCompare(b.label));
  }, [recordings, signLabels, trainingSettings.minimum_samples, trainingSettings.minimum_participants]);

  if (adminLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!isAdmin) return <div className="mx-auto w-full max-w-lg p-6 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-400" /><h2 className="mt-3 text-lg font-black text-slate-900">Acceso administrativo requerido</h2><p className="mt-2 text-sm text-slate-600">Esta sección está protegida por Supabase.</p><button onClick={() => setActiveTab('settings')} className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Volver a ajustes</button></div>;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setActiveTab('settings')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"><ArrowLeft className="h-4 w-4" />Ajustes</button>
        <button onClick={() => void loadRecordings()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</button>
      </div>

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-3"><span className="rounded-2xl bg-emerald-600 p-3 text-white"><ShieldCheck className="h-6 w-6" /></span><div><h2 className="text-lg font-black text-slate-900">Revisión del dataset LSD</h2><p className="text-sm text-slate-600">Los videos permanecen privados y los enlaces de revisión vencen en 5 minutos.</p></div></div></div>
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Aprobar no entrena el lector inmediatamente.</strong> La muestra queda validada para el próximo entrenamiento; el traductor aprenderá esa seña cuando se genere, evalúe y publique una nueva versión del modelo LSD.</p></div>
      <div className={`rounded-2xl border p-4 ${modelStatus?.available ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-slate-600">Estado del lector LSD</p><p className="mt-1 text-sm font-black text-slate-900">{modelStatus?.version === 'pending' ? 'Entrenamiento solicitado' : modelStatus?.available ? `Modelo publicado (${modelStatus.version})` : 'Sin modelo publicado aún'}</p>{modelStatus?.metrics ? <><p className="mt-1 text-xs text-slate-600">Macro F1 {modelStatus.metrics.macroF1.toFixed(2)} · recall mínimo {modelStatus.metrics.minimumClassRecall.toFixed(2)} · {modelStatus.metrics.testSamples} pruebas</p>{modelStatus.evaluationMode === 'experimental-resubstitution' && <p className="mt-1 text-xs font-bold text-amber-700">Métrica experimental sobre los mismos ejemplos: no mide reconocimiento de personas nuevas.</p>}{modelStatus.metrics.bodyContextSamples !== undefined && <p className="mt-1 text-xs text-slate-600">Contexto corporal: {modelStatus.metrics.bodyContextSamples}/{modelStatus.metrics.samples || modelStatus.metrics.testSamples} muestras.</p>}</> : <p className="mt-1 text-xs text-slate-600">Las muestras aprobadas se usarán cuando el pipeline de entrenamiento publique un nuevo modelo.</p>}</div>{modelStatus?.available ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Clock3 className="h-5 w-5 shrink-0 text-slate-400" />}</div>{trainingRun && <a href={trainingRun.runUrl} target="_blank" rel="noreferrer" className={`mt-3 block rounded-xl border p-3 text-xs font-bold ${trainingRun.status !== 'completed' ? 'border-amber-200 bg-amber-50 text-amber-900' : trainingRun.conclusion === 'success' ? 'border-emerald-200 bg-white/70 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}><span className="block font-black">Último entrenamiento: {trainingRun.status !== 'completed' ? 'en curso' : trainingRun.conclusion === 'success' ? 'completado' : 'falló'}</span><span className="mt-1 block font-semibold">{new Date(trainingRun.createdAt).toLocaleString('es-DO')} · commit {trainingRun.commit} · Abrir detalles</span></a>}{publishNotice && <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs font-bold text-emerald-900">{publishNotice}</p>}<button onClick={() => void publishModel()} disabled={publishSaving || !user} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{publishSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}Publicar modelo LSD</button></div>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-blue-950">Palabras y frases propuestas</h3><p className="mt-1 text-xs text-blue-800">Al aprobar una propuesta aparecerá en el selector de grabación. Todavía necesitará una grabación aprobada antes de entrenar.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-800">{labelProposals.filter((item) => item.status === 'pending').length} pendientes</span></div>
        <div className="mt-3 space-y-2">{labelProposals.filter((item) => item.status === 'pending').length === 0 ? <p className="rounded-xl bg-white/70 p-3 text-xs text-blue-800">No hay propuestas pendientes.</p> : labelProposals.filter((item) => item.status === 'pending').map((proposal) => <div key={proposal.id} className="rounded-xl bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-900">{proposal.display_name}</p><p className="mt-1 text-[11px] text-slate-500">{proposal.motion_type === 'two_hand' ? 'Dos manos' : proposal.motion_type === 'dynamic' ? 'Con movimiento' : 'Estática'} · {new Date(proposal.created_at).toLocaleDateString('es-DO')}</p></div><div className="flex gap-2"><button onClick={() => void reviewLabelProposal(proposal, 'rejected')} disabled={proposalReviewing === proposal.id} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50">Rechazar</button><button onClick={() => void reviewLabelProposal(proposal, 'approved')} disabled={proposalReviewing === proposal.id} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{proposalReviewing === proposal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aprobar'}</button></div></div></div>)}</div>
      </section>

      <details className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-violet-950"><SlidersHorizontal className="h-5 w-5" />Reglas de entrenamiento</summary>
        <p className="mt-2 text-xs text-violet-800">El modo 1 muestra / 1 participante permite comenzar, pero genera un modelo experimental que puede reconocer principalmente a quien lo grabó.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">Muestras por seña<input type="number" min="1" max="500" value={trainingSettings.minimum_samples} onChange={(event) => setTrainingSettings((current) => ({ ...current, minimum_samples: Math.max(1, Number(event.target.value)) }))} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2" /></label>
          <label className="text-xs font-bold text-slate-700">Participantes por seña<input type="number" min="1" max="100" value={trainingSettings.minimum_participants} onChange={(event) => setTrainingSettings((current) => ({ ...current, minimum_participants: Math.max(1, Number(event.target.value)) }))} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2" /></label>
          <label className="text-xs font-bold text-slate-700">Macro F1 mínimo<input type="number" min="0" max="1" step="0.05" value={trainingSettings.minimum_macro_f1} onChange={(event) => setTrainingSettings((current) => ({ ...current, minimum_macro_f1: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2" /></label>
          <label className="text-xs font-bold text-slate-700">Recall mínimo<input type="number" min="0" max="1" step="0.05" value={trainingSettings.minimum_class_recall} onChange={(event) => setTrainingSettings((current) => ({ ...current, minimum_class_recall: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2" /></label>
          <label className="text-xs font-bold text-slate-700">Confianza del lector<input type="number" min="0.5" max="1" step="0.01" value={trainingSettings.confidence_threshold} onChange={(event) => setTrainingSettings((current) => ({ ...current, confidence_threshold: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2" /></label>
          <label className="flex items-center gap-2 self-end rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><input type="checkbox" checked={trainingSettings.allow_experimental} onChange={(event) => setTrainingSettings((current) => ({ ...current, allow_experimental: event.target.checked }))} />Permitir modelo experimental</label>
        </div>
        <button onClick={() => void saveTrainingSettings()} disabled={trainingSaving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{trainingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar reglas</button>
      </details>

      <div className="grid grid-cols-3 gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((status) => <button key={status} onClick={() => { setFilter(status); setSelected(null); setVideoUrl(''); }} className={`rounded-2xl border p-3 text-center transition ${filter === status ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}><span className="block text-xl font-black">{counts[status]}</span><span className="text-[11px] font-bold">{statusLabel[status]}</span></button>)}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Preparación para entrenar</h3><p className="mt-0.5 text-xs text-slate-500">Regla actual: {trainingSettings.minimum_samples} muestra(s) y {trainingSettings.minimum_participants} participante(s) por seña.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{trainingReadiness.filter((item) => item.ready).length}/{trainingReadiness.length} listas</span></div>
        {trainingReadiness.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{trainingReadiness.map((item) => <div key={item.code} className={`rounded-xl border p-3 ${item.ready ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black text-slate-800">{item.label}</span>{item.ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />}</div><p className="mt-1 text-[11px] font-semibold text-slate-500">{item.samples}/{trainingSettings.minimum_samples} muestras · {item.participants}/{trainingSettings.minimum_participants} personas</p></div>)}</div> : <p className="mt-3 text-xs text-slate-500">Todavía no hay muestras aprobadas.</p>}
      </section>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <section className="min-w-0 space-y-2">
          {loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay muestras {statusLabel[filter].toLowerCase()}s.</div> : visible.map((recording) => (
            <button key={recording.id} onClick={() => void openRecording(recording)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === recording.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{recording.sign_labels?.display_name || 'Etiqueta desconocida'}</p><p className="mt-1 text-xs text-slate-500">{recording.dataset_participants?.pseudonym || 'Participante'} · {recording.sign_labels?.variant || 'LSD'}</p></div><Play className="h-5 w-5 shrink-0 text-emerald-600" /></div>
              <p className="mt-3 text-[11px] font-semibold text-slate-500">{recording.frame_count} fotogramas · {(recording.duration_ms / 1000).toFixed(1)} s · {new Date(recording.created_at).toLocaleDateString('es-DO')}</p>
            </button>
          ))}
        </section>

        <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {!selected ? <div className="grid min-h-80 place-items-center text-center"><div><Play className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">Selecciona una muestra para revisarla</p></div></div> : <div>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{selected.sign_labels?.variant} · {selected.sign_labels?.motion_type}</p><h3 className="mt-1 text-xl font-black text-slate-900">{selected.sign_labels?.display_name}</h3><p className="mt-1 text-xs text-slate-500">{selected.dataset_participants?.pseudonym} · mano {selected.dataset_participants?.dominant_hand} · {selected.dataset_participants?.country_code}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{statusLabel[selected.status]}</span></div>
            <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-slate-950">{previewLoading ? <div className="grid h-full place-items-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div> : videoUrl && !videoError ? <video key={videoUrl} src={videoUrl} controls playsInline preload="metadata" onLoadedData={() => setVideoError(false)} onError={() => setVideoError(true)} className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center p-5 text-center text-sm text-white">{videoError ? 'Este navegador no puede reproducir el formato de esta grabación.' : 'Video no disponible'}</div>}</div>
            {videoUrl && <a href={videoUrl} target="_blank" rel="noreferrer" download className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Abrir o descargar video privado</a>}
            {selected.status === 'pending' ? <div className="mt-4 space-y-3"><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Razón del rechazo (obligatoria solamente al rechazar)" className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-emerald-500" /><div className="grid gap-2 sm:grid-cols-2"><button onClick={() => void review('rejected')} disabled={saving} className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 disabled:opacity-50"><XCircle className="mr-2 inline h-4 w-4" />Rechazar</button><button onClick={() => void review('approved')} disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 inline h-4 w-4" />}Aprobar</button></div></div> : <div className={`mt-4 rounded-xl p-3 text-sm ${selected.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{selected.status === 'approved' ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : <XCircle className="mr-2 inline h-4 w-4" />}{statusLabel[selected.status]}{selected.reviewed_at ? ` el ${new Date(selected.reviewed_at).toLocaleString('es-DO')}` : ''}{selected.rejection_reason ? ` · ${selected.rejection_reason}` : ''}</div>}
          </div>}
        </section>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><Clock3 className="h-4 w-4" />Solo las muestras aprobadas se usarán posteriormente para entrenar el modelo.</p>
    </div>
  );
};
