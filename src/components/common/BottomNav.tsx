import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { AppTab } from '../../types';
import { Camera, BookOpen, MessageSquare, Settings, Sparkles } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, history } = useApp();
  const { activeTheme } = useTheme();

  if (activeTab === 'splash') return null;

  const navItems: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'translator',
      label: 'Traductor',
      icon: <Camera className="w-5 h-5" />,
    },
    {
      id: 'phrases',
      label: 'Frases',
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      id: 'history',
      label: 'Historial',
      icon: <MessageSquare className="w-5 h-5" />,
      badge: history.length > 0 ? history.length : undefined,
    },
    {
      id: 'settings',
      label: 'Ajustes',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 w-full max-w-full border-t border-slate-100 bg-white/95 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur-lg transition-colors duration-300 sm:px-3">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 items-center">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-1.5 transition-all duration-200 active:scale-90 sm:px-3 ${
                isActive ? 'font-bold' : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
              style={{
                color: isActive ? activeTheme.primaryHex : undefined,
              }}
            >
              {/* Active Pill Background */}
              {isActive && (
                <span
                  className="absolute inset-0 rounded-2xl opacity-15 transition-all duration-300"
                  style={{ backgroundColor: activeTheme.primaryHex }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <div className="relative">
                  {item.icon}
                  {item.badge !== undefined && (
                    <span
                      className="absolute -top-1 -right-2 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full text-white shadow-xs"
                      style={{ backgroundColor: activeTheme.primaryHex }}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="max-w-full truncate text-[10px] tracking-tight min-[360px]:text-[11px]">{item.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
