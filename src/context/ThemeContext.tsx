import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeColorKey, ThemeOption, AppSettings } from '../types';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export const THEME_OPTIONS: Record<ThemeColorKey, ThemeOption> = {
  blue: {
    key: 'blue',
    name: 'Azul Eléctrico (Predeterminado)',
    primaryHex: '#1A73E3',
    lightHex: '#EBF3FE',
    darkHex: '#1255AA',
    glowClass: 'shadow-blue-500/20 border-blue-500',
    bgGradient: 'from-blue-500 to-indigo-600',
  },
  mint: {
    key: 'mint',
    name: 'Verde Menta',
    primaryHex: '#10B981',
    lightHex: '#ECFDF5',
    darkHex: '#047857',
    glowClass: 'shadow-emerald-500/20 border-emerald-500',
    bgGradient: 'from-emerald-500 to-teal-600',
  },
  violet: {
    key: 'violet',
    name: 'Violeta Neón',
    primaryHex: '#8B5CF6',
    lightHex: '#F5F3FF',
    darkHex: '#6D28D9',
    glowClass: 'shadow-purple-500/20 border-purple-500',
    bgGradient: 'from-purple-500 to-violet-600',
  },
  orange: {
    key: 'orange',
    name: 'Naranja Cálido',
    primaryHex: '#F97316',
    lightHex: '#FFF7ED',
    darkHex: '#C2410C',
    glowClass: 'shadow-orange-500/20 border-orange-500',
    bgGradient: 'from-orange-500 to-amber-600',
  },
  pink: {
    key: 'pink',
    name: 'Rosado Dulce',
    primaryHex: '#EC4899',
    lightHex: '#FDF2F8',
    darkHex: '#BE185D',
    glowClass: 'shadow-pink-500/20 border-pink-500',
    bgGradient: 'from-pink-500 to-rose-600',
  },
};

interface ThemeContextType {
  activeTheme: ThemeOption;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  setThemeColor: (colorKey: ThemeColorKey) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeColor: 'blue',
  autoTTS: true,
  hapticFeedback: true,
  speechRate: 1.0,
  speechPitch: 1.0,
  cameraFPS: 30,
  overlayStyle: 'skeletal',
  iconStyle: 'linear_hand',
  selectedVoice: '',
  language: 'es',
  signLanguageVariant: 'LSD',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('signtalk_settings') || localStorage.getItem('signtalk_express_settings');
      if (saved) {
        try {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch (e) {
          // parse error
        }
      }
    }
    return DEFAULT_SETTINGS;
  });

  const activeTheme = THEME_OPTIONS[settings.themeColor] || THEME_OPTIONS.blue;

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase.from('user_preferences').select('settings').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (!active) return;
      if (data?.settings && typeof data.settings === 'object') setSettings((current) => ({ ...current, ...(data.settings as Partial<AppSettings>) }));
      setRemoteLoaded(true);
    });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('signtalk_settings', JSON.stringify(settings));
      localStorage.removeItem('signtalk_express_settings');
      document.documentElement.style.setProperty('--primary-color', activeTheme.primaryHex);
      document.documentElement.style.setProperty('--primary-light', activeTheme.lightHex);
      document.documentElement.style.setProperty('--primary-dark', activeTheme.darkHex);
    }
  }, [settings, activeTheme]);

  useEffect(() => {
    if (!user || !remoteLoaded) return;
    const timer = window.setTimeout(() => {
      void supabase.from('user_preferences').upsert({ user_id: user.id, settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [settings, user, remoteLoaded]);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const setThemeColor = (colorKey: ThemeColorKey) => {
    updateSettings({ themeColor: colorKey });
  };

  return (
    <ThemeContext.Provider value={{ activeTheme, settings, updateSettings, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
