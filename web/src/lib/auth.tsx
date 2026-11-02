import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setAccessToken, setUnauthorizedHandler } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; timezone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: AuthUser) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);

  const setUser = useCallback((u: AuthUser) => setUserState(u), []);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.post<{ user: AuthUser; accessToken?: string }>('/api/auth/refresh');
      if (data.accessToken) setAccessToken(data.accessToken);
      const me = await api.get<{ user: AuthUser }>('/api/auth/me');
      setUserState(me.user);
    } catch {
      setUserState(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setUnauthorizedHandler(() => {
      setUserState(null);
      setAccessToken(null);
    });
    void fetchMe();
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ user: AuthUser; accessToken: string }>('/api/auth/login', { email, password });
      setAccessToken(data.accessToken);
      setUserState(data.user);
      qc.clear();
    },
    [qc],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; timezone?: string }) => {
      const data = await api.post<{ user: AuthUser; accessToken: string }>('/api/auth/register', input);
      setAccessToken(data.accessToken);
      setUserState(data.user);
      qc.clear();
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setAccessToken(null);
      setUserState(null);
      qc.clear();
    }
  }, [qc]);

  const refreshUser = useCallback(async () => {
    const me = await api.get<{ user: AuthUser }>('/api/auth/me');
    setUserState(me.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setUser }),
    [user, loading, login, register, logout, refreshUser, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/* ── profile / settings helpers ─────────────────────────────── */

export type ProfilePayload = {
  user: { id: string; name: string; email: string; createdAt: string; lastLoginAt: string | null };
  profile: {
    id: string;
    occupation: string | null;
    primaryGoal: string | null;
    timezone: string;
    weekStart: number;
    focusHours: string[];
    onboarded: boolean;
    bio: string | null;
    avatarUrl: string | null;
  };
  settings: {
    theme: 'light' | 'dark' | 'system';
    accent: string;
    aiEnabled: boolean;
    aiAutoInsights: boolean;
    weeklyEmailDigest: boolean;
    moodTrackingOptIn: boolean;
    demoDataLoaded: boolean;
  };
  counts: Record<string, number>;
};

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api.get<ProfilePayload>('/api/users/profile') });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch('/api/users/profile', patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void refreshUser();
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch('/api/users/settings', patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });
}

/* ── theme ───────────────────────────────────────────────────── */

export type ThemeMode = 'light' | 'dark' | 'system';

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  localStorage.setItem('lifehub-theme', mode);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => (localStorage.getItem('lifehub-theme') as ThemeMode) || 'system');

  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  return { mode, setMode: (m: ThemeMode) => setMode(m) };
}
