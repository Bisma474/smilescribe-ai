// Central API client — reads token from localStorage and attaches to every request
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && path !== '/auth/login') {
    // Try refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('access_token')}`;
      const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      if (!retry.ok) throw new Error(await retry.text());
      return retry.json();
    }
    // Refresh failed — clear session and redirect only if not already on login page
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
    }
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ── Auth API ──
export interface LoginPayload { email: string; password: string }
export interface RegisterPayload { email: string; password: string; full_name: string; practice_name?: string }
export interface TokenResponse { access_token: string; refresh_token: string; token_type: string; expires_in: number }
export interface UserOut { id: number; email: string; full_name: string | null; role: string; practice_name: string | null; license_number: string | null; is_active: boolean; is_verified: boolean }

export const authApi = {
  login: (payload: LoginPayload) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  register: (payload: RegisterPayload) =>
    request<UserOut>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  me: () => request<UserOut>('/auth/me'),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  updateProfile: (payload: { full_name?: string; practice_name?: string; license_number?: string }) =>
    request<UserOut>('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }),

  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

export interface Patient {
  id: number;
  name: string;
  dob?: string;
  meta?: string;
  date: string;
  initials?: string;
  badge_text?: string;
  badge?: string;
  bg?: string;
  color?: string;
}

export interface ClinicalSession {
  id: number;
  patient_id: number;
  status: string;
  transcript?: string;
  perio_data?: any;
  clinical_entries?: any[];
  summary_report?: any;
  created_at: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  action: string;
  user_name: string;
  details: string;
}

export const patientsApi = {
  list: () => request<Patient[]>('/patients'),
  create: (payload: Partial<Patient>) =>
    request<Patient>('/patients', { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: number) => request<Patient>(`/patients/${id}`),
};

export const sessionsApi = {
  getActive: (patientId: number) => request<ClinicalSession>(`/transcription/session/${patientId}`),
  save: (payload: Partial<ClinicalSession>) =>
    request<ClinicalSession>('/transcription/session', { method: 'POST', body: JSON.stringify(payload) }),
  update: (sessionId: number, payload: Partial<ClinicalSession>) =>
    request<ClinicalSession>(`/notes/session/${sessionId}`, { method: 'PUT', body: JSON.stringify(payload) }),
};

export const logsApi = {
  list: () => request<AuditLog[]>('/audit-logs'),
  create: (payload: { action: string; user_name: string; details: string }) =>
    request<AuditLog>('/audit-logs', { method: 'POST', body: JSON.stringify(payload) }),
};
