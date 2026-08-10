import React, { useState } from 'react';
import { Hand, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'login' | 'register' | 'forgot';

export const AuthScreen: React.FC = () => {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'forgot') {
        await auth.sendPasswordReset(email);
        setMessage('Te enviamos un enlace para restablecer tu contraseña.');
      } else if (mode === 'register') {
        const confirmationRequired = await auth.signUp(email, password, fullName);
        if (confirmationRequired) setMessage('Revisa tu correo y confirma tu cuenta para continuar.');
      } else {
        await auth.signInWithPassword(email, password);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    setError('');
    try {
      await auth.signInWithGoogle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión con Google.');
      setGoogleBusy(false);
    }
  };

  const GoogleLogo = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.11-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.64.39 3.19 1.04 4.55l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
    </svg>
  );

  if (!auth.configured) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="max-w-lg rounded-3xl bg-white p-8 shadow-sm border border-slate-200"><h1 className="text-xl font-black text-slate-900">Configura Supabase</h1><p className="mt-2 text-sm text-slate-600">Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en tu archivo <code>.env.local</code>. Consulta el README para completar OAuth y correos.</p></div></div>;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <section className="hidden lg:flex flex-col justify-between bg-slate-950 text-white p-12">
        <div className="flex items-center gap-3 font-black text-xl"><Hand className="h-8 w-8 text-blue-400" /> SignTalk</div>
        <div><h1 className="text-5xl font-black leading-tight">Comunicación más accesible, en tiempo real.</h1><p className="mt-5 text-slate-300 max-w-xl">Traduce señas desde tu cámara, escucha el resultado y conserva tu historial de forma privada.</p></div>
        <p className="text-xs text-slate-500">Las sesiones se cierran obligatoriamente tras 48 horas.</p>
      </section>
      <main className="grid place-items-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 sm:p-9 shadow-xl shadow-slate-200/60 border border-slate-100">
          <div className="lg:hidden flex items-center gap-2 font-black text-lg mb-8"><Hand className="h-7 w-7 text-blue-600" /> SignTalk</div>
          <h2 className="text-2xl font-black text-slate-900">{mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Recuperar contraseña' : 'Iniciar sesión'}</h2>
          <p className="mt-1 text-sm text-slate-500">{mode === 'register' ? 'Confirma tu correo antes de ingresar.' : mode === 'forgot' ? 'Recibirás un enlace seguro por correo.' : 'Accede a tu traductor e historial.'}</p>

          {mode !== 'forgot' && <button type="button" onClick={() => void continueWithGoogle()} disabled={googleBusy || busy} className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow disabled:cursor-wait disabled:opacity-60"><GoogleLogo />{googleBusy ? <><Loader2 className="h-4 w-4 animate-spin" />Conectando…</> : 'Continuar con Google'}</button>}
          {mode !== 'forgot' && <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> o con email <span className="h-px flex-1 bg-slate-200" /></div>}

          <form onSubmit={submit} className="space-y-4 mt-5">
            {mode === 'register' && <label className="block text-sm font-bold text-slate-700">Nombre completo<input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-blue-500" /></label>}
            <label className="block text-sm font-bold text-slate-700">Correo electrónico<div className="relative mt-1.5"><Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 font-normal outline-none focus:ring-2 focus:ring-blue-500" /></div></label>
            {mode !== 'forgot' && <label className="block text-sm font-bold text-slate-700">Contraseña<div className="relative mt-1.5"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input required minLength={8} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 font-normal outline-none focus:ring-2 focus:ring-blue-500" /></div></label>}
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : mode === 'register' ? 'Registrarme' : mode === 'forgot' ? 'Enviar enlace' : 'Ingresar'}</button>
          </form>
          <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
            {mode === 'login' && <button onClick={() => setMode('forgot')} className="text-blue-700 font-bold">Olvidé mi contraseña</button>}
            <button onClick={() => setMode(mode === 'register' ? 'login' : mode === 'login' ? 'register' : 'login')} className="text-slate-600 font-bold">{mode === 'register' ? 'Ya tengo cuenta' : mode === 'login' ? 'Crear una cuenta' : 'Volver al inicio'}</button>
          </div>
        </div>
      </main>
    </div>
  );
};
