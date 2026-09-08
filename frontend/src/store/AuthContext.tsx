'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { authApi, UserOut } from '@/lib/apiClient';

interface AuthContextValue {
  user: UserOut | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch { /* ignore — tokens are discarded client-side regardless */ }
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
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, register, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
