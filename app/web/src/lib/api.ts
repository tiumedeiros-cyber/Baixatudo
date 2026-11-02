export type ApiError = { error: string; status: number };

const ACCESS_KEY = 'navalha.access';
const REFRESH_KEY = 'navalha.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access?: string, refresh?: string) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  const response = await fetch(`/api${path}`, { ...options, headers });

  if (response.status === 401 && retry && tokens.refresh) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh }),
    });
    if (refreshed.ok) {
      const data = await refreshed.json();
      tokens.set(data.access_token, data.refresh_token);
      return request<T>(path, options, false);
    }
    tokens.clear();
    onUnauthorized?.();
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw { error: data?.error || 'Algo deu errado. Tente novamente.', status: response.status } as ApiError;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/* ------------------------------- Tipos ---------------------------------- */
export type Service = {
  id: string;
  branch_id: string;
  name: string;
  description: string;
  category: string;
  duration_min: number;
  buffer_min: number;
  price_cents: number;
  image_url?: string | null;
  active: boolean;
};

export type Professional = {
  id: string;
  user_id: string;
  branch_id: string;
  name: string;
  avatar_url?: string | null;
  bio?: string;
  specialties: string[];
  rating: number;
  avg_rating?: number;
  commission_pct?: number;
  services?: string[];
  atendimentos?: number;
  active?: boolean;
  working_hours?: { id: string; weekday: number; start_min: number; end_min: number; break_start?: number; break_end?: number }[];
  time_off?: { id: string; start_at: string; end_at: string; reason: string; kind: string }[];
};

export type AppointmentItem = {
  id: string;
  service_id: string;
  name: string;
  duration_min: number;
  price_cents: number;
};

export type Appointment = {
  id: string;
  code: string;
  branch_id: string;
  client_id: string;
  professional_id: string;
  start_at: string;
  end_at: string;
  status: 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'no_show';
  payment_status: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  coupon_code?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  checkin_token: string;
  checked_in_at?: string | null;
  items: AppointmentItem[];
  professional?: { id: string; name: string; avatar_url?: string };
  client?: { id: string; name: string; email: string; phone: string };
  payment?: { id: string; method: string; status: string; amount_cents: number } | null;
  review?: { id: string; rating: number; comment?: string } | null;
  professional_name?: string;
  can_review?: boolean;
  client_name?: string;
  duration_min: number;
  status_label: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
  branch_id?: string;
  avatar_url?: string;
  locale?: string;
  birthday?: string;
  preferences?: Record<string, unknown>;
  tags?: string[];
  client_id?: string | null;
  professional_id?: string | null;
};

export type NotificationItem = {
  id: string;
  channel: string;
  type: string;
  title: string;
  body: string;
  read_at?: string | null;
  sent_at: string;
};

export type Slot = { start_at: string; end_at: string; professional_id: string };
