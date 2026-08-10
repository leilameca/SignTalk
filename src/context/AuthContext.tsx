import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const MAX_SESSION_AGE_MS = 48 * 60 * 60 * 1000;
const SESSION_STARTED_KEY = 'signtalk_session_started_at';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  recoveryMode: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearRecoveryMode: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getSessionStart(session: Session): number {
  const storageKey = `${SESSION_STARTED_KEY}:${session.user.id}`;
  const saved = Number(localStorage.getItem(storageKey));
  if (Number.isFinite(saved) && saved > 0) return saved;
  const lastSignIn = Date.parse(session.user.last_sign_in_at || '');
  const startedAt = Number.isFinite(lastSignIn) ? lastSignIn : session.expires_at
    ? session.expires_at * 1000 - 60 * 60 * 1000
    : Date.now();
  localStorage.setItem(storageKey, String(startedAt));
  return startedAt;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const enforceAbsoluteExpiry = useCallback(async (candidate: Session | null) => {
    if (!candidate) return null;
    if (Date.now() - getSessionStart(candidate) >= MAX_SESSION_AGE_MS) {
      localStorage.removeItem(`${SESSION_STARTED_KEY}:${candidate.user.id}`);
      await supabase.auth.signOut();
      return null;
    }
    return candidate;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const validSession = await enforceAbsoluteExpiry(data.session);
      if (active) {
        sessionRef.current = validSession;
        setSession(validSession);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      void enforceAbsoluteExpiry(nextSession).then((validSession) => {
        if (active) {
          sessionRef.current = validSession;
          setSession(validSession);
          setLoading(false);
        }
      });
    });

    const interval = window.setInterval(() => {
      void enforceAbsoluteExpiry(sessionRef.current).then((validSession) => {
        sessionRef.current = validSession;
        setSession(validSession);
      });
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      listener.subscription.unsubscribe();
    };
  }, [enforceAbsoluteExpiry]);

  useEffect(() => {
    let active = true;
    if (!session?.user) {
      setIsAdmin(false);
      setAdminLoading(false);
      return;
    }
    setAdminLoading(true);
    void supabase.rpc('is_app_admin').then(({ data, error }) => {
      if (!active) return;
      setIsAdmin(!error && data === true);
      setAdminLoading(false);
    });
    return () => { active = false; };
  }, [session?.user.id]);

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
    return !data.session;
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?recovery=true`,
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
  };

  const signOut = async () => {
    if (session) localStorage.removeItem(`${SESSION_STARTED_KEY}:${session.user.id}`);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    recoveryMode,
    isAdmin,
    adminLoading,
    configured: isSupabaseConfigured,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    sendPasswordReset,
    updatePassword,
    signOut,
    clearRecoveryMode: () => setRecoveryMode(false),
  }), [session, loading, recoveryMode, isAdmin, adminLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
