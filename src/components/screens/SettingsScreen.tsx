import React, { useState, useEffect } from 'react';
import { useTheme, THEME_OPTIONS } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ThemeColorKey } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { speakText, getAvailableVoices } from '../../utils/speech';
import {
  Palette,
  Volume2,
  Vibrate,
  Sliders,
  SlidersHorizontal,
  Hand,
  Sparkles,
  RotateCcw,
  Check,
  CheckCircle2,
  Smartphone,
  Eye,
  Globe,
  Database,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const { setActiveTab } = useApp();
  const { isAdmin } = useAuth();
  const { activeTheme, settings, updateSettings, setThemeColor } = useTheme();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableVoices();
      setVoices(v);
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleTestHaptic = () => {
    triggerHaptic('success', true);
  };

  const handleTestSpeech = () => {
    speakText(
      'SignTalk: Prueba de síntesis de voz en español.',
      settings.speechRate,
      settings.speechPitch,
      settings.selectedVoice
    );
  };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col gap-5 overflow-x-hidden bg-[#FFFFFF] p-4 pb-28 sm:p-6 sm:pb-28">
      {isAdmin && <button onClick={() => setActiveTab('admin')} className="flex w-full items-center gap-3 rounded-[28px] border border-violet-200 bg-violet-50 p-5 text-left shadow-xs transition hover:bg-violet-100">
        <span className="rounded-2xl bg-violet-700 p-3 text-white"><ShieldCheck className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-slate-900">Panel de administración</span><span className="mt-1 block text-xs font-medium text-slate-600">Revisa, aprueba o rechaza grabaciones del dataset LSD.</span></span>
        <ArrowRight className="h-5 w-5 shrink-0 text-violet-700" />
      </button>}
      <button onClick={() => setActiveTab('contribute')} className="flex w-full items-center gap-3 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-left shadow-xs transition hover:bg-emerald-100">
        <span className="rounded-2xl bg-emerald-600 p-3 text-white"><Database className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-slate-900">Contribuir señas para entrenar SignTalk</span><span className="mt-1 block text-xs font-medium text-slate-600">Graba ejemplos voluntarios de LSD y ayuda a construir un modelo dominicano más preciso.</span></span>
        <ArrowRight className="h-5 w-5 shrink-0 text-emerald-700" />
      </button>
      <div className="bg-[#F8F9FA] rounded-[28px] p-5 border border-slate-100/80 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5" style={{ color: activeTheme.primaryHex }} />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Variante de lengua de señas</h3>
            <p className="text-[11px] font-medium text-slate-500">Gemini adaptará la interpretación inmediatamente</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Variante de lengua de señas">
          {([
            { id: 'LSD', flag: '🇩🇴', title: 'Lengua de Señas Dominicana', subtitle: 'LSD · Predeterminada' },
            { id: 'ASL', flag: '🇺🇸', title: 'American Sign Language', subtitle: 'ASL · Americana' },
          ] as const).map((variant) => {
            const selected = settings.signLanguageVariant === variant.id;
            return <button key={variant.id} type="button" role="radio" aria-checked={selected} onClick={() => updateSettings({ signLanguageVariant: variant.id })} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${selected ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'}`}>
              <span className="text-2xl" aria-hidden="true">{variant.flag}</span>
              <span className="flex-1"><span className="block text-xs font-extrabold">{variant.title}</span><span className={`mt-0.5 block text-[10px] font-semibold ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{variant.subtitle}</span></span>
              {selected && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            </button>;
          })}
        </div>
      </div>
      {/* Interactive Color Picker Section (Color Picker interactivo para cambiar el color Azul predeterminado) */}
      <div className="bg-[#F8F9FA] rounded-[28px] p-5 border border-slate-100/80 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-5 h-5" style={{ color: activeTheme.primaryHex }} />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Personalización de Color</h3>
            <p className="text-[11px] font-medium text-slate-500">
              Selecciona tu tono primario de acento favorito
            </p>
          </div>
        </div>

        {/* 5 Theme Color Swatches Grid */}
        <div className="grid grid-cols-5 gap-2.5 my-2">
          {(Object.keys(THEME_OPTIONS) as ThemeColorKey[]).map((key) => {
            const option = THEME_OPTIONS[key];
            const isSelected = settings.themeColor === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setThemeColor(key);
                  triggerHaptic('click', settings.hapticFeedback);
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all active:scale-90 relative ${
                  isSelected ? 'ring-2 ring-slate-900 scale-105' : 'hover:scale-95 opacity-80'
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full shadow-md flex items-center justify-center text-white"
                  style={{ backgroundColor: option.primaryHex }}
                >
                  {isSelected && <Check className="w-5 h-5 stroke-[3]" />}
                </div>
                <span className="text-[10px] font-bold text-slate-700 text-center leading-tight">
                  {key === 'blue'
                    ? 'Azul'
                    : key === 'mint'
                    ? 'Menta'
                    : key === 'violet'
                    ? 'Violeta'
                    : key === 'orange'
                    ? 'Naranja'
                    : 'Rosado'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Color Preview Indicator Banner */}
        <div
          className="mt-3 p-3 rounded-2xl flex items-center justify-between text-xs font-bold text-white shadow-xs transition-colors duration-300"
          style={{ backgroundColor: activeTheme.primaryHex }}
        >
          <span>Color activo: {activeTheme.name}</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Aplicado
          </span>
        </div>
      </div>

      {/* Voice & Speech Controls (Switches para activar/desactivar reproducción de voz) */}
      <div className="bg-[#F8F9FA] rounded-[28px] p-5 border border-slate-100/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Reproducción Automática</h3>
              <p className="text-[11px] font-medium text-slate-500">
                Lector de voz automático al detectar seña
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoTTS}
              onChange={(e) => updateSettings({ autoTTS: e.target.checked })}
              className="sr-only peer"
            />
            <div
              className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"
              style={{
                backgroundColor: settings.autoTTS ? activeTheme.primaryHex : undefined,
              }}
            />
          </label>
        </div>

        {/* Speech Speed & Pitch Sliders */}
        <div className="space-y-3 border-t border-slate-200/60 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">Velocidad de Voz</span>
            <span className="text-xs font-black text-slate-600">{settings.speechRate.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={settings.speechRate}
            onChange={(e) => updateSettings({ speechRate: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
            style={{ accentColor: activeTheme.primaryHex }}
          />

          {/* Test Voice Speech Button */}
          <button
            onClick={handleTestSpeech}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Volume2 className="w-4 h-4 text-slate-600" />
            <span>Probar Voz de Prueba</span>
          </button>
        </div>
      </div>

      {/* Haptic Micro-Interactions Settings (Vibraciones hápticas) */}
      <div className="bg-[#F8F9FA] rounded-[28px] p-5 border border-slate-100/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vibrate className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Vibración Háptica</h3>
              <p className="text-[11px] font-medium text-slate-500">
                Micro-vibración al reconocer seña con éxito
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hapticFeedback}
              onChange={(e) => updateSettings({ hapticFeedback: e.target.checked })}
              className="sr-only peer"
            />
            <div
              className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"
              style={{
                backgroundColor: settings.hapticFeedback ? activeTheme.primaryHex : undefined,
              }}
            />
          </label>
        </div>

        <button
          onClick={handleTestHaptic}
          className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Vibrate className="w-4 h-4 text-slate-600" />
          <span>Probar Vibración Háptica</span>
        </button>
      </div>

      {/* Icon Style Selector (Selector de iconos elegantes nada de emojis) */}
      <div className="bg-[#F8F9FA] rounded-[28px] p-5 border border-slate-100/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Hand className="w-5 h-5 text-slate-700" />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Estilo Visual de Íconos</h3>
              <p className="text-[11px] font-medium text-slate-500">
              Ilustraciones lineales humanas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'linear_hand', label: 'Mano Lineal (Recomendado)' },
            { id: 'minimal_line', label: 'Línea Mínima' },
            { id: 'bold_stroke', label: 'Trazo Marcado' },
          ].map((styleOption) => {
            const isSelected = settings.iconStyle === styleOption.id;
            return (
              <button
                key={styleOption.id}
                onClick={() => updateSettings({ iconStyle: styleOption.id as 'linear_hand' | 'minimal_line' | 'bold_stroke' })}
                className={`p-3 rounded-2xl text-xs font-bold transition-all border text-center ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {styleOption.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hand Tracking Skeleton Overlay Style Selector */}
      <div className="bg-[#F8F9FA] rounded-[28px] p-5 border border-slate-100/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5 text-slate-700" />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Estilo de Malla Esquelética</h3>
            <p className="text-[11px] font-medium text-slate-500">
              Superposición gráfica sobre la vista de cámara
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'skeletal', label: 'Nodos Esqueléticos' },
            { id: 'glowing', label: 'Aura Brillante' },
            { id: 'minimal', label: 'Puntos Mínimos' },
          ].map((overlayOption) => {
            const isSelected = settings.overlayStyle === overlayOption.id;
            return (
              <button
                key={overlayOption.id}
                onClick={() => updateSettings({ overlayStyle: overlayOption.id as 'skeletal' | 'glowing' | 'minimal' })}
                className={`p-3 rounded-2xl text-xs font-bold transition-all border text-center ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {overlayOption.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
