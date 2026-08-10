import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Volume2,
  Trash2,
  Copy,
  Download,
  Send,
  Check,
  Search,
  MessageSquare,
  Hand,
  Sparkles,
  ArrowDown
} from 'lucide-react';

export const HistoryScreen: React.FC = () => {
  const {
    history,
    historyLoading,
    historyError,
    addSpokenResponseToHistory,
    clearHistory,
    deleteHistoryItem,
    speakPhrase
  } = useApp();

  const { activeTheme } = useTheme();

  const [inputText, setInputText] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSendSpokenResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    try {
      await addSpokenResponseToHistory(inputText.trim());
      speakPhrase(inputText.trim());
      setInputText('');
    } catch {
      // AppContext exposes the database error in the history banner.
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportHistory = () => {
    if (history.length === 0) return;
    const exportText = history
      ? history
          .map(
            (item) =>
              `[${new Date(item.createdAt).toLocaleString()}] (${item.type === 'sign' ? 'Seña Traducida' : 'Respuesta'}) ${
                item.signText
              }${item.spokenReply ? ' -> ' + item.spokenReply : ''}`
          )
          .join('\n')
      : '';

    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SignTalk_Historial_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
  };

  const filteredHistory = history.filter(
    (item) =>
      item.signText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.spokenReply && item.spokenReply.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col gap-4 overflow-x-hidden bg-[#FFFFFF] p-4 pb-28 sm:p-6 sm:pb-28">
      {historyError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{historyError}</p>}
      {historyLoading && <p className="text-center text-sm text-slate-500">Cargando historial…</p>}
      {/* Top Search & Global Actions Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en historial..."
            className="w-full bg-[#F8F9FA] pl-10 pr-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-800 border border-slate-100 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportHistory}
            disabled={history.length === 0}
            className="p-2.5 rounded-2xl bg-[#F8F9FA] hover:bg-slate-200/60 border border-slate-200/80 text-slate-700 active:scale-95 transition-all"
            title="Exportar Conversación"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => void clearHistory()}
            disabled={history.length === 0}
            className="p-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 active:scale-95 transition-all"
            title="Borrar Historial"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Messages Feed Container */}
      <div className="flex-1 flex flex-col gap-3 min-h-[300px]">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((item) => {
            const isSign = item.type === 'sign';

            return (
              <div
                key={item.id}
                className={`flex max-w-[92%] min-w-0 flex-col gap-1 sm:max-w-[85%] ${
                  isSign ? 'self-start' : 'self-end'
                }`}
              >
                <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-400 gap-2">
                  <span className="flex items-center gap-1">
                    {isSign ? (
                      <>
                        <Hand className="w-3 h-3 text-blue-500" />
                        <span>Seña Traducida</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-3 h-3 text-slate-500" />
                        <span>Respuesta de Voz</span>
                      </>
                    )}
                  </span>
                  <span>{new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>

                {/* Chat Bubble (Burbujas de diálogo estilo chat: señas traducidas en azul con texto blanco, respuestas habladas en tarjetas blancas con borde gris) */}
                <div
                  className={`p-4 rounded-[22px] shadow-sm relative group transition-all duration-200 ${
                    isSign
                      ? 'text-white rounded-tl-xs'
                      : 'bg-[#FFFFFF] text-slate-800 border-2 border-slate-200/80 rounded-tr-xs'
                  }`}
                  style={{
                    backgroundColor: isSign ? activeTheme.primaryHex : undefined,
                  }}
                >
                  <p className="break-words text-sm font-bold leading-relaxed [overflow-wrap:anywhere]">
                    {isSign ? item.signText : item.spokenReply || item.signText}
                  </p>

                  {/* Actions inside bubble */}
                  <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-white/20">
                    <button
                      onClick={() =>
                        speakPhrase(isSign ? item.signText : item.spokenReply || item.signText)
                      }
                      className={`p-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all active:scale-90 ${
                        isSign
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Escuchar audio"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() =>
                        handleCopy(
                          isSign ? item.signText : item.spokenReply || item.signText,
                          item.id
                        )
                      }
                      className={`p-1.5 rounded-xl text-xs font-semibold transition-all active:scale-90 ${
                        isSign
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Copiar texto"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => void deleteHistoryItem(item.id)}
                      className={`p-1.5 rounded-xl text-xs font-semibold transition-all opacity-60 hover:opacity-100 active:scale-90 ${
                        isSign ? 'text-white' : 'text-rose-500'
                      }`}
                      title="Eliminar mensaje"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F8F9FA] rounded-[28px] border border-slate-100 my-auto">
            <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">Sin mensajes registrados</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Usa la cámara o la biblioteca de frases para construir tu conversación
            </p>
          </div>
        )}
      </div>

      {/* Reply Input Bar for Dual Communication */}
      <form
        onSubmit={handleSendSpokenResponse}
        className="sticky bottom-16 mx-auto mt-3 w-full max-w-4xl p-3 bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl z-30 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Escribe una respuesta hablada..."
            className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-[#F8F9FA] px-4 py-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 rounded-2xl text-white shadow-md active:scale-90 transition-all disabled:opacity-40"
            style={{ backgroundColor: activeTheme.primaryHex }}
            title="Responder por Voz"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
