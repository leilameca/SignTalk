import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { LogoIntertwinedHands } from './HandIllustrations';
import { Sparkles, Sliders, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = () => {
  const { activeTab, setActiveTab } = useApp();
  const { activeTheme } = useTheme();
  const { user, signOut } = useAuth();

  if (activeTab === 'splash') return null;

  const getTitle = () => {
    switch (activeTab) {
      case 'translator':
        return 'SignTalk';
      case 'phrases':
        return 'Frases Rápidas';
      case 'history':
        return 'Historial de Conversación';
      case 'settings':
        return 'Configuración & Temas';
      case 'contribute':
        return 'Contribuir señas LSD';
      case 'admin':
        return 'Administración del dataset';
      default:
        return 'SignTalk';
    }
  };

  const getSubtitle = () => {
    switch (activeTab) {
      case 'translator':
        return 'Traductor en tiempo real';
      case 'phrases':
        return 'Comunicación directa en un toque';
      case 'history':
        return 'Registro interactivo de señas';
      case 'settings':
        return 'Personaliza tu experiencia';
      case 'contribute':
        return 'Ayuda a mejorar el reconocimiento local';
      case 'admin':
        return 'Revisa y aprueba muestras de entrenamiento';
      default:
        return '';
    }
  };

  return (
    <header className="bg-white/95 backdrop-blur-md sticky top-0 z-30 border-b border-slate-100 shadow-xs transition-colors duration-300">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-6"><div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
        <button
          onClick={() => setActiveTab('splash')}
          className="group relative flex shrink-0 items-center justify-center rounded-xl p-1.5 transition-transform hover:bg-slate-100 active:scale-95"
          title="Ver Presentación / Splash"
        >
          <LogoIntertwinedHands className="w-8 h-8" color={activeTheme.primaryHex} />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
        </button>
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-1.5 text-base font-extrabold tracking-tight text-slate-900">
            <span className="truncate">{getTitle()}</span>
            {activeTab === 'translator' && (
              <span
                className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs min-[380px]:inline"
                style={{ backgroundColor: activeTheme.primaryHex }}
              >
                En Vivo
              </span>
            )}
          </h1>
          <p className="mt-0.5 hidden truncate text-[11px] font-medium leading-none text-slate-500 min-[360px]:block">
            {getSubtitle()}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        {activeTab === 'translator' && (
          <button
            onClick={() => setActiveTab('phrases')}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-1 text-xs font-semibold"
            style={{ color: activeTheme.primaryHex }}
            title="Ir a Frases Rápidas"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Frases</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('settings')}
          className={`p-2.5 rounded-xl transition-all active:scale-95 ${
            activeTab === 'settings'
              ? 'text-white shadow-md'
              : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
          }`}
          style={{
            backgroundColor: activeTab === 'settings' ? activeTheme.primaryHex : undefined,
          }}
          title="Ajustes y Personalización"
        >
          <Sliders className="w-4 h-4" />
        </button>
        <span className="hidden max-w-40 truncate text-xs font-semibold text-slate-500 sm:block">{user?.email}</span>
        <button onClick={() => void signOut()} className="p-2.5 rounded-xl text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-600" title="Cerrar sesión"><LogOut className="w-4 h-4" /></button>
      </div>
      </div>
    </header>
  );
};
