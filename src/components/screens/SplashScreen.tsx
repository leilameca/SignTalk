import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { LogoIntertwinedHands } from '../common/HandIllustrations';
import { Camera, Sparkles, Volume2, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

export const SplashScreen: React.FC = () => {
  const { setActiveTab } = useApp();
  const { activeTheme } = useTheme();
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean>(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);

  const slides = [
    {
      title: 'Traducción de Señas en Tiempo Real',
      description:
        'Interpreta señas en vivo mediante seguimiento esquelético de manos y tecnología inteligente.',
      icon: <Camera className="w-10 h-10 text-white" />,
      tag: 'Cámara IA',
    },
    {
      title: 'Síntesis de Voz & Frases Rápidas',
      description:
        'Escucha las frases traducidas con audio instantáneo y accede a una amplia biblioteca de emergencias, salud y compras.',
      icon: <Volume2 className="w-10 h-10 text-white" />,
      tag: 'Voz & Frases',
    },
    {
      title: 'Inclusivo, Cálido & Personalizable',
      description:
        'Personaliza los colores de acento, activa la vibración háptica al detectar un gesto y guarda tus conversaciones.',
      icon: <Sparkles className="w-10 h-10 text-white" />,
      tag: 'Diseño Inclusivo',
    },
  ];

  const handleRequestCameraPermission = async () => {
    setIsRequestingPermission(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraPermissionGranted(true);
        // Stop stream test
        stream.getTracks().forEach((track) => track.stop());
      } else {
        setCameraPermissionGranted(true);
      }
    } catch (e) {
      console.warn('Camera permission denied:', e);
      setCameraPermissionGranted(false);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleStart = () => {
    setActiveTab('translator');
  };

  return (
    <div className="min-h-full flex flex-col justify-between p-6 bg-[#FFFFFF] relative overflow-hidden">
      {/* Background soft ambient glow */}
      <div
        className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10 blur-3xl pointer-events-none transition-colors duration-500"
        style={{ backgroundColor: activeTheme.primaryHex }}
      />
      <div
        className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-10 blur-3xl pointer-events-none transition-colors duration-500"
        style={{ backgroundColor: activeTheme.primaryHex }}
      />

      {/* Top Header Logo Branding */}
      <div className="flex flex-col items-center pt-6 text-center z-10">
        <div className="relative mb-3 group">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: activeTheme.lightHex }}
          >
            <LogoIntertwinedHands
              className="w-16 h-16"
              color={activeTheme.primaryHex}
              animated={true}
            />
          </div>
          <span
            className="absolute -bottom-2 px-3 py-0.5 rounded-full text-[10px] font-extrabold text-white tracking-widest uppercase shadow-xs"
            style={{ backgroundColor: activeTheme.primaryHex }}
          >
            Versión 2.5
          </span>
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-2">
          SignTalk
        </h1>
        <p className="text-xs font-semibold text-slate-500 max-w-xs mt-1">
          Traducción inclusiva de Lengua de Señas en tiempo real
        </p>
      </div>

      {/* Center Interactive Onboarding Slider Card */}
      <div className="my-6 z-10">
        <div className="bg-[#F8F9FA] rounded-[28px] p-6 shadow-sm border border-slate-100/80 transition-all duration-300 relative">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white uppercase tracking-wider"
              style={{ backgroundColor: activeTheme.primaryHex }}
            >
              {slides[currentSlide].tag}
            </span>
            <div className="flex gap-1.5">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentSlide ? 'w-6' : 'w-2 bg-slate-300'
                  }`}
                  style={{
                    backgroundColor: idx === currentSlide ? activeTheme.primaryHex : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-3">
            <div
              className="p-3.5 rounded-2xl shadow-md shrink-0 transition-colors duration-300"
              style={{ backgroundColor: activeTheme.primaryHex }}
            >
              {slides[currentSlide].icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {slides[currentSlide].title}
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            {slides[currentSlide].description}
          </p>
        </div>
      </div>

      {/* Bottom Actions & Camera Permissions Setup */}
      <div className="space-y-3 z-10 pb-4">
        {/* Camera Permission Button / Status */}
        <div className="bg-[#F8F9FA] rounded-2xl p-3.5 border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-slate-600" />
            <div>
              <p className="text-xs font-bold text-slate-800">Permisos de Cámara</p>
              <p className="text-[11px] font-medium text-slate-500">
                {cameraPermissionGranted
                  ? 'Cámara lista para traducir'
                  : 'Requerido para la vista en vivo'}
              </p>
            </div>
          </div>

          {cameraPermissionGranted ? (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Listo
            </span>
          ) : (
            <button
              onClick={handleRequestCameraPermission}
              disabled={isRequestingPermission}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-200/60 active:scale-95 transition-all text-slate-700"
            >
              {isRequestingPermission ? 'Comprobando...' : 'Permitir'}
            </button>
          )}
        </div>

        {/* Start Button "Comenzar a Traducir" */}
        <button
          onClick={handleStart}
          className="w-full py-4 px-6 rounded-2xl text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all duration-200 hover:opacity-95"
          style={{ backgroundColor: activeTheme.primaryHex }}
        >
          <span>Comenzar a Traducir</span>
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-[10px] text-center font-medium text-slate-400">
          Diseño Accesible • Sin Almacenamiento Inseguro • Soporta LSE / ASL
        </p>
      </div>
    </div>
  );
};
