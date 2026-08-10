import React, { useState } from 'react';
import { useApp, PRESET_GESTURES } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { PresetGesture } from '../../types';
import {
  HandGreetingIcon,
  HandHealthIcon,
  HandEmergencyIcon,
  HandShoppingIcon,
  HandILoveYouGesture,
  HandOpenPalmGesture,
  HandFistGesture,
  HandPointGesture,
} from '../common/HandIllustrations';
import { Volume2, Search, Plus, Check, Info, ArrowRight, Share2, Copy } from 'lucide-react';

export const QuickPhrasesScreen: React.FC = () => {
  const { addWordToSentence, speakPhrase, isSpeaking, setActiveTab } = useApp();
  const { activeTheme } = useTheme();

  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeModalGesture, setActiveModalGesture] = useState<PresetGesture | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = [
    { id: 'Todos', label: 'Todos', icon: null },
    { id: 'Saludos', label: 'Saludos', icon: <HandGreetingIcon className="w-4 h-4" /> },
    { id: 'Salud', label: 'Salud', icon: <HandHealthIcon className="w-4 h-4" /> },
    { id: 'Emergencia', label: 'Emergencia', icon: <HandEmergencyIcon className="w-4 h-4" /> },
    { id: 'Compras', label: 'Compras', icon: <HandShoppingIcon className="w-4 h-4" /> },
  ];

  const filteredPhrases = PRESET_GESTURES.filter((gesture) => {
    const matchesCategory =
      selectedCategory === 'Todos' || gesture.category === selectedCategory;
    const matchesSearch =
      gesture.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gesture.translation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gesture.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSpeak = (gesture: PresetGesture, e: React.MouseEvent) => {
    e.stopPropagation();
    speakPhrase(gesture.translation);
  };

  const handleAddToTranslator = (gesture: PresetGesture, e: React.MouseEvent) => {
    e.stopPropagation();
    addWordToSentence(gesture.translation);
    setActiveTab('translator');
  };

  const handleCopy = (gesture: PresetGesture, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(gesture.translation);
    setCopiedId(gesture.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getGestureIllustration = (gesture: PresetGesture) => {
    switch (gesture.id) {
      case 'g1':
        return <HandOpenPalmGesture className="w-10 h-10" color={activeTheme.primaryHex} />;
      case 'g2':
        return <HandGreetingIcon className="w-10 h-10" color={activeTheme.primaryHex} />;
      case 'g3':
        return <HandFistGesture className="w-10 h-10" color={activeTheme.primaryHex} />;
      case 'g4':
        return <HandHealthIcon className="w-10 h-10" color={activeTheme.primaryHex} />;
      case 'g5':
        return <HandShoppingIcon className="w-10 h-10" color={activeTheme.primaryHex} />;
      case 'g8':
        return <HandILoveYouGesture className="w-10 h-10" color={activeTheme.primaryHex} />;
      default:
        return <HandPointGesture className="w-10 h-10" color={activeTheme.primaryHex} />;
    }
  };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-4 overflow-x-hidden bg-[#FFFFFF] p-4 pb-28 sm:p-6 sm:pb-28">
      {/* Top Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar frase o seña (ej: Hola, Salud, Baño)..."
          className="w-full bg-[#F8F9FA] pl-10 pr-4 py-3 rounded-2xl text-xs font-semibold text-slate-800 placeholder-slate-400 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
        />
      </div>

      {/* Categories Filter Tabs with Hand-Drawn Icons */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {categories.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all duration-200 border flex items-center gap-1.5 active:scale-95 ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-[#F8F9FA] text-slate-700 border-slate-200/80 hover:bg-slate-200/60'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Grid of Phrase Cards (Malla de tarjetas blancas con bordes azules al pulsar) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredPhrases.map((gesture) => (
          <div
            key={gesture.id}
            onClick={() => setActiveModalGesture(gesture)}
            className="bg-[#FFFFFF] rounded-[24px] p-4 border-2 border-slate-100 hover:border-slate-300 active:border-blue-500 transition-all duration-200 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            style={{
              borderColor: undefined,
            }}
          >
            {/* Top Tag & Hand Illustration */}
            <div className="flex items-start justify-between mb-3">
              <span
                className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full text-white uppercase tracking-wider shadow-2xs"
                style={{ backgroundColor: activeTheme.primaryHex }}
              >
                {gesture.category}
              </span>

              <div className="p-2 rounded-2xl bg-[#F8F9FA] border border-slate-100 group-hover:scale-110 transition-transform">
                {getGestureIllustration(gesture)}
              </div>
            </div>

            {/* Gesture Title & Description */}
            <div className="mb-3">
              <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                {gesture.title}
              </h3>
              <p className="text-xs font-medium text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                {gesture.description}
              </p>
            </div>

            {/* Card Footer Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
              <button
                onClick={(e) => handleSpeak(gesture, e)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#F8F9FA] hover:bg-slate-200/60 text-slate-700 transition-all active:scale-95"
                title="Pronunciar Seña"
              >
                <Volume2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Escuchar</span>
              </button>

              <button
                onClick={(e) => handleAddToTranslator(gesture, e)}
                className="p-2 rounded-xl text-white shadow-xs active:scale-95 transition-all"
                style={{ backgroundColor: activeTheme.primaryHex }}
                title="Agregar al Traductor"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredPhrases.length === 0 && (
        <div className="text-center py-12 bg-[#F8F9FA] rounded-[28px] p-6 border border-slate-100">
          <p className="text-sm font-bold text-slate-700">No se encontraron frases</p>
          <p className="text-xs text-slate-400 mt-1">Intenta con otra palabra de búsqueda</p>
        </div>
      )}

      {/* Step-by-Step Gesture Detail Modal */}
      {activeModalGesture && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[28px] border border-slate-100 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:rounded-[32px] sm:p-6">
            <button
              onClick={() => setActiveModalGesture(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center hover:bg-slate-200 text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100">
                {getGestureIllustration(activeModalGesture)}
              </div>
              <div>
                <span
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-full text-white uppercase tracking-wider"
                  style={{ backgroundColor: activeTheme.primaryHex }}
                >
                  {activeModalGesture.category}
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  {activeModalGesture.title}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-medium mb-4 leading-relaxed bg-[#F8F9FA] p-3 rounded-2xl border border-slate-100">
              {activeModalGesture.description}
            </p>

            <div className="space-y-2 mb-5">
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Guía Paso a Paso
              </h4>
              <ol className="space-y-2">
                {activeModalGesture.stepInstructions.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs font-medium text-slate-700">
                    <span
                      className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: activeTheme.primaryHex }}
                    >
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2 min-[360px]:flex-row">
              <button
                onClick={(e) => {
                  speakPhrase(activeModalGesture.translation);
                }}
                className="flex-1 py-3 px-4 rounded-2xl text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
                style={{ backgroundColor: activeTheme.primaryHex }}
              >
                <Volume2 className="w-4 h-4" />
                <span>Pronunciar</span>
              </button>

              <button
                onClick={(e) => {
                  addWordToSentence(activeModalGesture.translation);
                  setActiveModalGesture(null);
                  setActiveTab('translator');
                }}
                className="py-3 px-4 rounded-2xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <span>Usar en Traductor</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
