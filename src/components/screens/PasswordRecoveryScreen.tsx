import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export const PasswordRecoveryScreen: React.FC = () => {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setError('Usa al menos 8 caracteres.');
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    try {
      await updatePassword(password);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar la contraseña.');
    }
  };

  return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg border border-slate-100"><h1 className="text-2xl font-black">Nueva contraseña</h1>{done ? <><p className="mt-4 text-emerald-700">Tu contraseña fue actualizada.</p><button type="button" onClick={() => void signOut()} className="mt-5 w-full rounded-xl bg-slate-900 py-3 font-bold text-white">Volver a iniciar sesión</button></> : <><p className="mt-1 text-sm text-slate-500">Crea una contraseña de al menos 8 caracteres.</p><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nueva contraseña" className="mt-5 w-full rounded-xl border border-slate-300 p-3" /><input type="password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Confirmar contraseña" className="mt-3 w-full rounded-xl border border-slate-300 p-3" />{error && <p className="mt-3 text-sm text-rose-700">{error}</p>}<button className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-bold text-white">Actualizar contraseña</button></>}</form></div>;
};
