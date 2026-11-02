import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  CalendarCheck,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelsTopLeft,
  Settings,
  Smile,
  Sparkles,
  Sun,
  Timer,
  User,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useTheme } from '@/lib/auth';
import { cn, initials, formatDate } from '@/lib/utils';
import { api } from '@/lib/api';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'My Tasks', icon: CalendarCheck },
  { to: '/habits', label: 'Habits', icon: Activity },
  { to: '/mood', label: 'Mood Tracker', icon: Smile },
  { to: '/journal', label: 'Journal', icon: BookOpen },
  { to: '/sessions', label: 'Study Sessions', icon: Timer },
  { to: '/routine', label: 'Daily Routine', icon: Moon },
  { to: '/assistant', label: 'AI Assistant', icon: Bot, badge: 'AI' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const ACCOUNT = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-500 shadow-glow">
        <Sparkles className="h-4.5 w-4.5 text-white" />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <p className="font-display text-[15px] font-extrabold tracking-tight text-ink-900 dark:text-white">
            AI-Life<span className="gradient-text">Hub</span>
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">Productivity OS</p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { data: counts } = useQuery({
    queryKey: ['nav-counts'],
    queryFn: () => api.get<{ total: number }>('/api/tasks?status=OPEN&limit=1'),
    select: (d) => ({ tasks: d.total }),
    staleTime: 30_000,
  });

  const today = useMemo(() => formatDate(new Date(), { weekday: 'long', year: 'numeric' }), []);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 lg:hidden dark:hover:bg-ink-800" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Workspace</p>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                {item.badge}
              </span>
            )}
            {item.to === '/tasks' && counts?.tasks ? (
              <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">{counts.tasks}</span>
            ) : null}
          </NavLink>
        ))}

        <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Account</p>
        {ACCOUNT.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}>
            <item.icon className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mb-3 rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-br from-brand-50 to-blue-50 p-3.5 dark:from-brand-500/10 dark:to-blue-500/5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" />
          <p className="text-xs font-bold text-ink-900 dark:text-white">Low-effort tracking</p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
          Every check-in, timer and completed task feeds your insights automatically. No daily questionnaire.
        </p>
      </div>

      <div className="border-t border-[rgb(var(--border))] p-3">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-blue-500 text-[11px] font-bold text-white">
              {initials(user?.name ?? 'U')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink-900 dark:text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-ink-500">{user?.email}</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition', menuOpen && 'rotate-180')} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 shadow-lift animate-scale-in">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  onClick={() => {
                    setMenuOpen(false);
                    setMode(mode === 'dark' ? 'light' : 'dark');
                  }}
                >
                  {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {mode === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/settings');
                  }}
                >
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <div className="my-1 h-px bg-[rgb(var(--border))]" />
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  onClick={async () => {
                    setMenuOpen(false);
                    await logout();
                    navigate('/login');
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const currentLabel =
    [...NAV, ...ACCOUNT].find((n) => location.pathname.startsWith(n.to))?.label ?? 'Dashboard';

  return (
    <div className="flex min-h-screen bg-[rgb(var(--bg))]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] lg:block">{sidebar}</aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl animate-slide-up">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]/85 px-4 backdrop-blur-md sm:px-6">
          <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden dark:hover:bg-ink-800" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo collapsed />
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <PanelsTopLeft className="h-4 w-4 text-ink-400" />
            <h1 className="truncate font-display text-[15px] font-bold text-ink-900 dark:text-white">{currentLabel}</h1>
            <span className="ml-1 hidden text-xs text-ink-400 xl:inline">· {today}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              aria-label="Toggle theme"
            >
              {mode === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <NavLink to="/assistant" className="btn-primary hidden h-9 px-3.5 text-[13px] sm:inline-flex">
              <Sparkles className="h-4 w-4" /> Ask AI
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>

        <footer className="border-t border-[rgb(var(--border))] px-6 py-4 text-center text-[11px] text-ink-400">
          AI-LifeHub · insights are generated from your own activity and are not medical advice.
        </footer>
      </div>
    </div>
  );
}
