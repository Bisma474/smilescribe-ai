'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { authApi, UserOut } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  user: UserOut | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  completeGoogleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, full_name: string, practice_name?: string) => Promise<void>;
  updateProfile: (full_name: string, practice_name: string, license_number?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { setIsLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login({ email, password });
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    const me = await authApi.me();
    setUser(me);
  }, []);

  // Kicks off the Supabase Google OAuth redirect — the browser navigates
  // away to Google, then back to /auth/callback once Google (via
  // Supabase) hands back a session. Nothing to await here beyond the
  // redirect itself starting; completeGoogleLogin (below) is what
  // finishes the login once we're back.
  const loginWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(error.message);
  }, []);

  // Called from the /auth/callback page once Supabase has processed the
  // Google redirect and established a Supabase session client-side. The
  // backend accepts any valid Supabase-issued access token regardless of
  // how the user authenticated (password or Google), so this just copies
  // that session's tokens into the same localStorage keys the
  // password-login flow uses, then hydrates the profile exactly like
  // login() does — self-healing a local profile row on first Google
  // sign-in (see backend get_or_create_profile).
  const completeGoogleLogin = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw new Error(error?.message || 'Google sign-in did not complete — no session was returned.');
    }
    localStorage.setItem('access_token', data.session.access_token);
    localStorage.setItem('refresh_token', data.session.refresh_token);
    const me = await authApi.me();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch { /* ignore — tokens are discarded client-side regardless */ }
    // Also clear the Supabase client's own session (relevant for Google
    // sign-ins, which supabase-js persists in its own storage key
    // separately from the access_token/refresh_token pair above).
    try {
      await supabase.auth.signOut();
    } catch { /* ignore — same reasoning as above */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  }, []);

  const register = useCallback(async (email: string, password: string, full_name: string, practice_name?: string) => {
    await authApi.register({ email, password, full_name, practice_name });
    try {
      await login(email, password);
    } catch {
      // Registration itself succeeded — this only means Supabase requires
      // email confirmation before the account can sign in. Surface a
      // specific, actionable message instead of a generic login failure.
      throw new Error(
        'Account created. Please check your email to confirm your address before signing in.'
      );
    }
  }, [login]);

  const updateProfile = useCallback(async (
    full_name: string, practice_name: string, license_number?: string
  ) => {
    const updatedUser = await authApi.updateProfile({ full_name, practice_name, license_number });
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, loginWithGoogle, completeGoogleLogin, logout, register, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
