import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokens, setUnauthorizedHandler, type User } from './api';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  loginOtp: (phone: string, code: string, name?: string) => Promise<User>;
  loginOAuth: (provider: 'google' | 'facebook', email: string, name: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  patchUser: (patch: Partial<User>) => void;
};

const AuthContext = createContext<AuthState | null>(null);

type AuthResponse = { user: User; access_token: string; refresh_token: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((data: AuthResponse) => {
    tokens.set(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.user;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!tokens.access) throw new Error('sem sessão');
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch {
      tokens.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => {
      tokens.clear();
      setUser(null);
    });
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      login: async (email, password) => apply(await api.post<AuthResponse>('/auth/login', { email, password })),
      register: async (payload) => apply(await api.post<AuthResponse>('/auth/register', payload)),
      loginOtp: async (phone, code, name) => apply(await api.post<AuthResponse>('/auth/otp/verify', { phone, code, name })),
      loginOAuth: async (provider, email, name) =>
        apply(await api.post<AuthResponse>(`/auth/oauth/${provider}`, { email, name })),
      logout: () => {
        api.post('/auth/logout', { refresh_token: tokens.refresh }).catch(() => {});
        tokens.clear();
        setUser(null);
      },
      patchUser: (patch) => setUser((current) => (current ? { ...current, ...patch } : current)),
    }),
    [user, loading, apply, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
