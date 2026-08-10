import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppTab, PresetGesture, TranslationMessage } from '../types';
import { triggerHaptic, triggerTermFeedback } from '../utils/haptics';
import { speakText } from '../utils/speech';
import { useTheme } from './ThemeContext';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

// This is a reference phrase library, never detector output.
export const PRESET_GESTURES: PresetGesture[] = [
  ['g1', 'Hola', 'Saludos', 'Hola', 'Palma abierta levantada junto a la sien, moviéndola hacia afuera.'],
  ['g2', 'Gracias', 'Saludos', 'Gracias', 'Dedos junto a la barbilla que se extienden hacia adelante.'],
  ['g3', 'Necesito ayuda', 'Emergencia', 'Necesito ayuda médica de emergencia', 'Puño sobre la palma de la otra mano, elevando ambas manos.'],
  ['g4', 'Me duele aquí', 'Salud', 'Tengo dolor en esta zona', 'El índice señala la zona donde se siente dolor.'],
  ['g5', '¿Cuánto cuesta?', 'Compras', '¿Cuál es el precio de esto?', 'El pulgar y el índice se rozan para representar dinero.'],
  ['g6', 'Por favor', 'Saludos', 'Por favor', 'La palma realiza círculos suaves sobre el pecho.'],
  ['g7', '¿Dónde está el baño?', 'Básicos', '¿Dónde está el baño?', 'La mano forma la letra T y la muñeca oscila.'],
  ['g8', 'Te quiero', 'Saludos', 'Te quiero', 'Pulgar, índice y meñique extendidos.'],
].map(([id, title, category, translation, description]) => ({
  id,
  title,
  category: category as PresetGesture['category'],
  translation,
  handType: 'Right',
  difficulty: 'Fácil',
  description,
  stepInstructions: [description],
}));

interface DetectionState {
  confidence: number | null;
  handDetails: string;
}

interface AppContextType {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  activeSentence: string[];
  detection: DetectionState;
  isCapturing: boolean;
  setIsCapturing: (value: boolean) => void;
  setDetection: React.Dispatch<React.SetStateAction<DetectionState>>;
  addWordToSentence: (word: string) => void;
  clearSentence: () => void;
  removeLastWord: () => void;
  commitSentenceToHistory: () => Promise<void>;
  history: TranslationMessage[];
  historyLoading: boolean;
  historyError: string;
  addSpokenResponseToHistory: (text: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  speakPhrase: (text: string) => void;
  isSpeaking: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const HISTORY_STORAGE_PREFIX = 'signtalk_history';

const historyStorageKey = (userId?: string) => `${HISTORY_STORAGE_PREFIX}:${userId || 'guest'}`;
const historyDeleteQueueKey = (userId: string) => `signtalk_history_delete_queue:${userId}`;
const historyClearPendingKey = (userId: string) => `signtalk_history_clear_pending:${userId}`;

function readLocalHistory(userId?: string): TranslationMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function queueHistoryDeletion(userId: string, id: string) {
  try {
    const queued = JSON.parse(localStorage.getItem(historyDeleteQueueKey(userId)) || '[]');
    const ids = Array.isArray(queued) ? queued.filter((item): item is string => typeof item === 'string') : [];
    localStorage.setItem(historyDeleteQueueKey(userId), JSON.stringify([...new Set([...ids, id])]));
  } catch {
    // The local UI remains usable even if persistent storage is unavailable.
  }
}

function fromRow(row: Record<string, unknown>): TranslationMessage {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    signText: String(row.sign_text),
    spokenReply: row.spoken_reply ? String(row.spoken_reply) : undefined,
    confidence: row.confidence == null ? null : Number(row.confidence),
    type: row.type as TranslationMessage['type'],
    category: row.category ? String(row.category) : undefined,
    handDetails: row.hand_details ? String(row.hand_details) : undefined,
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>('translator');
  const [activeSentence, setActiveSentence] = useState<string[]>([]);
  const [detection, setDetection] = useState<DetectionState>({ confidence: null, handDetails: '' });
  const [isCapturing, setIsCapturing] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<TranslationMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const skipNextHistoryPersistRef = useRef(false);

  const loadHistory = useCallback(async () => {
    const localHistory = readLocalHistory(user?.id);
    skipNextHistoryPersistRef.current = true;
    setHistory(localHistory);
    setHistoryLoading(false);
    if (!user || !navigator.onLine) return;

    if (localStorage.getItem(historyClearPendingKey(user.id)) === '1') {
      const { error } = await supabase.from('translations_history').delete().eq('user_id', user.id);
      if (!error) localStorage.removeItem(historyClearPendingKey(user.id));
    }
    try {
      const queued = JSON.parse(localStorage.getItem(historyDeleteQueueKey(user.id)) || '[]');
      const ids = Array.isArray(queued) ? queued.filter((item): item is string => typeof item === 'string') : [];
      if (ids.length) {
        const { error } = await supabase.from('translations_history').delete().in('id', ids);
        if (!error) localStorage.removeItem(historyDeleteQueueKey(user.id));
      }
    } catch {
      // Retry malformed/unavailable local queues on a later load.
    }

    const { data, error } = await supabase.from('translations_history').select('*').order('created_at', { ascending: false });
    if (error) setHistoryError('Sin conexión con la nube. El historial local sigue disponible.');
    else {
      const remoteHistory = (data || []).map((row) => fromRow(row));
      const pending = localHistory.filter((item) => item.pendingSync);
      const remainingPending: TranslationMessage[] = [];
      const syncedHistory: TranslationMessage[] = [];
      for (const item of pending) {
        const { data: synced, error: syncError } = await supabase.from('translations_history').insert({
          user_id: user.id,
          sign_text: item.signText,
          spoken_reply: item.spokenReply || null,
          confidence: item.confidence,
          type: item.type,
          category: item.category || null,
          hand_details: item.handDetails || null,
        }).select().single();
        if (syncError) remainingPending.push(item);
        else syncedHistory.push(fromRow(synced));
      }
      setHistory([...remainingPending, ...syncedHistory, ...remoteHistory]);
      setHistoryError(remainingPending.length ? 'Algunos elementos siguen guardados solamente en este dispositivo.' : '');
    }
  }, [user]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (skipNextHistoryPersistRef.current) {
      skipNextHistoryPersistRef.current = false;
      return;
    }
    localStorage.setItem(historyStorageKey(user?.id), JSON.stringify(history));
  }, [history, user?.id]);

  useEffect(() => {
    const syncWhenOnline = () => void loadHistory();
    window.addEventListener('online', syncWhenOnline);
    return () => window.removeEventListener('online', syncWhenOnline);
  }, [loadHistory]);

  useEffect(() => {
    localStorage.setItem('signtalk_active_sentence', JSON.stringify(activeSentence));
  }, [activeSentence]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('signtalk_active_sentence') || '[]');
      if (Array.isArray(saved)) setActiveSentence(saved.filter((item): item is string => typeof item === 'string'));
    } catch {
      // Keep an empty sentence when local storage is unavailable or malformed.
    }
  }, []);

  const speakPhrase = (text: string) => {
    if (!text) return;
    triggerHaptic('light', settings.hapticFeedback);
    setIsSpeaking(true);
    speakText(text, settings.speechRate, settings.speechPitch, settings.selectedVoice, () => setIsSpeaking(false), () => setIsSpeaking(false));
  };

  const addWordToSentence = (word: string) => {
    if (!word.trim()) return;
    setActiveSentence((previous) => [...previous, word.trim()]);
    triggerTermFeedback(settings.hapticFeedback);
    if (settings.autoTTS) speakPhrase(word);
  };

  const insertHistory = async (values: Record<string, unknown>) => {
    const localItem: TranslationMessage = {
      id: `local-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      signText: String(values.sign_text || ''),
      spokenReply: values.spoken_reply ? String(values.spoken_reply) : undefined,
      confidence: typeof values.confidence === 'number' ? values.confidence : null,
      type: values.type === 'spoken' ? 'spoken' : 'sign',
      category: values.category ? String(values.category) : undefined,
      handDetails: values.hand_details ? String(values.hand_details) : undefined,
      pendingSync: true,
    };
    setHistory((previous) => [localItem, ...previous]);
    if (!user || !navigator.onLine) {
      setHistoryError('Guardado en este dispositivo. Se sincronizará cuando vuelva la conexión.');
      return;
    }
    const { data, error } = await supabase.from('translations_history').insert({ ...values, user_id: user.id }).select().single();
    if (error) {
      setHistoryError('Guardado en este dispositivo; la nube no está disponible ahora.');
      return;
    }
    setHistory((previous) => previous.map((item) => item.id === localItem.id ? fromRow(data) : item));
    setHistoryError('');
  };

  const commitSentenceToHistory = async () => {
    if (!activeSentence.length) return;
    await insertHistory({
      sign_text: activeSentence.join(' '),
      confidence: detection.confidence,
      type: 'sign',
      category: 'Traducción',
      hand_details: detection.handDetails || null,
    });
    setActiveSentence([]);
  };

  const addSpokenResponseToHistory = async (text: string) => {
    if (!text.trim()) return;
    await insertHistory({ sign_text: 'Respuesta de voz', spoken_reply: text.trim(), confidence: null, type: 'spoken' });
  };

  const clearHistory = async () => {
    setHistory([]);
    if (!user || !navigator.onLine) {
      if (user) localStorage.setItem(historyClearPendingKey(user.id), '1');
      setHistoryError('Historial eliminado de este dispositivo.');
      return;
    }
    const { error } = await supabase.from('translations_history').delete().eq('user_id', user.id);
    if (error) {
      localStorage.setItem(historyClearPendingKey(user.id), '1');
      setHistoryError('Se eliminó localmente, pero falta sincronizar la nube.');
    }
    else setHistoryError('');
  };

  const deleteHistoryItem = async (id: string) => {
    setHistory((previous) => previous.filter((item) => item.id !== id));
    if (id.startsWith('local-')) return;
    if (!navigator.onLine) {
      if (user) queueHistoryDeletion(user.id, id);
      return;
    }
    const { error } = await supabase.from('translations_history').delete().eq('id', id);
    if (error) {
      if (user) queueHistoryDeletion(user.id, id);
      setHistoryError('Elemento eliminado localmente; no se pudo actualizar la nube.');
    }
  };

  const value = useMemo<AppContextType>(() => ({
    activeTab, setActiveTab, activeSentence, detection, isCapturing, setIsCapturing, setDetection,
    addWordToSentence, clearSentence: () => setActiveSentence([]), removeLastWord: () => setActiveSentence((value) => value.slice(0, -1)),
    commitSentenceToHistory, history, historyLoading, historyError, addSpokenResponseToHistory,
    clearHistory, deleteHistoryItem, speakPhrase, isSpeaking,
  }), [activeTab, activeSentence, detection, isCapturing, history, historyLoading, historyError, isSpeaking, settings, user]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
