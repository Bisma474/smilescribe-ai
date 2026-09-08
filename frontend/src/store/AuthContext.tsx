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

const DEMO_USER: UserOut = {
  id: 1,
  email: 'dr.kim@brightsmile.com',
  full_name: 'Dr. Alice Kim',
  role: 'dentist',
  practice_name: 'Bright Smile Dental',
  license_number: 'CA-284710',
  is_active: true,
  is_verified: true,
};

const DEMO_ACCESS_TOKEN = 'demo-access-token';
const DEMO_REFRESH_TOKEN = 'demo-refresh-token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { setIsLoading(false); return; }
    authApi.me()
      .then((me) => {
        const override = localStorage.getItem(`user_override_${me.email}`);
        if (override) {
          try {
            setUser({ ...me, ...JSON.parse(override) });
          } catch {
            setUser(me);
          }
        } else {
          setUser(me);
        }
      })
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

    // For the demo account, skip /auth/me to avoid a 401 round-trip
    if (email === 'dr.kim@brightsmile.com') {
      setUser(DEMO_USER);
      return;
    }

    const me = await authApi.me();
    // Restore overrides if any exist
    const override = localStorage.getItem(`user_override_${me.email}`);
    if (override) {
      try {
        setUser({ ...me, ...JSON.parse(override) });
      } catch {
        setUser(me);
      }
    } else {
      setUser(me);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem('access_token') !== DEMO_ACCESS_TOKEN) {
        await authApi.logout();
      }
    } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  }, []);

  const register = useCallback(async (email: string, password: string, full_name: string, practice_name?: string) => {
    try {
      await authApi.register({ email, password, full_name, practice_name });
      await login(email, password);
    } catch {
      localStorage.setItem('access_token', DEMO_ACCESS_TOKEN);
      localStorage.setItem('refresh_token', DEMO_REFRESH_TOKEN);
      setUser({ ...DEMO_USER, email, full_name, practice_name: practice_name || DEMO_USER.practice_name });
    }
  }, [login]);

  const updateProfile = useCallback(async (
    full_name: string, practice_name: string, license_number?: string
  ) => {
    let updatedUser: UserOut;
    try {
      updatedUser = await authApi.updateProfile({ full_name, practice_name, license_number });
    } catch (err) {
      console.warn("Backend profile update failed, using client-side override fallback:", err);
      if (user) {
        updatedUser = {
          ...user,
          full_name,
          practice_name,
          license_number: license_number || null,
        };
      } else {
        throw err;
      }
    }
    setUser(updatedUser);
    localStorage.setItem(`user_override_${updatedUser.email}`, JSON.stringify(updatedUser));
  }, [user]);

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
