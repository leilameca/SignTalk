export type AppTab = 'splash' | 'translator' | 'phrases' | 'history' | 'settings' | 'contribute' | 'admin';

export type ThemeColorKey = 'blue' | 'mint' | 'violet' | 'orange' | 'pink';

export interface ThemeOption {
  key: ThemeColorKey;
  name: string;
  primaryHex: string;
  lightHex: string;
  darkHex: string;
  glowClass: string;
  bgGradient: string;
}

export interface HandPoint {
  x: number;
  y: number;
  z?: number;
}

export interface HandLandmarks {
  wrist: HandPoint;
  thumb: HandPoint[];
  index: HandPoint[];
  middle: HandPoint[];
  ring: HandPoint[];
  pinky: HandPoint[];
}

export interface PresetGesture {
  id: string;
  title: string;
  category: 'Saludos' | 'Salud' | 'Emergencia' | 'Compras' | 'Básicos';
  translation: string;
  handType: 'Right' | 'Left' | 'Both';
  difficulty: 'Fácil' | 'Medio';
  description: string;
  stepInstructions: string[];
  points?: HandLandmarks;
}

export interface TranslationMessage {
  id: string;
  createdAt: string;
  signText: string;
  spokenReply?: string;
  confidence: number | null;
  type: 'sign' | 'spoken';
  category?: string;
  handDetails?: string;
  pendingSync?: boolean;
}

export interface AppSettings {
  themeColor: ThemeColorKey;
  autoTTS: boolean;
  hapticFeedback: boolean;
  speechRate: number;
  speechPitch: number;
  cameraFPS: number;
  overlayStyle: 'skeletal' | 'glowing' | 'minimal';
  iconStyle: 'linear_hand' | 'minimal_line' | 'bold_stroke';
  selectedVoice: string;
  language: 'es' | 'en';
  signLanguageVariant: 'LSD' | 'ASL';
}
