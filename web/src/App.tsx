import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isTransientError } from '@/lib/api';
import { AppShell } from '@/components/AppShell';

const Login = lazy(() => import('@/pages/Login'));
const GoogleCallback = lazy(() => import('@/pages/GoogleCallback'));
const Register = lazy(() => import('@/pages/Register'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Projects = lazy(() => import('@/pages/Projects'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const Goals = lazy(() => import('@/pages/Goals'));
const GrowthHub = lazy(() => import('@/pages/GrowthHub'));
const Habits = lazy(() => import('@/pages/Habits'));
const Mood = lazy(() => import('@/pages/Mood'));
const Journal = lazy(() => import('@/pages/Journal'));
const Sessions = lazy(() => import('@/pages/Sessions'));
const Routine = lazy(() => import('@/pages/Routine'));
const Wellness = lazy(() => import('@/pages/Wellness'));
const Assistant = lazy(() => import('@/pages/Assistant'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Insights = lazy(() => import('@/pages/Insights'));
const Reports = lazy(() => import('@/pages/Reports'));
const Profile = lazy(() => import('@/pages/Profile'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx answers are deterministic — never retry them. Network failures and
      // 5xx/gateway errors are usually Render's free-tier cold start, so retry
      // with a short backoff before surfacing an error.
      retry: (count, err) => {
        if (!isTransientError(err)) return false;
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      // A failed mutation must surface immediately; the optimistic layer rolls back.
      retry: 0,
    },
  },
});

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--bg))]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        <p className="text-xs font-medium text-ink-500">Loading AI-LifeHub…</p>
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function OnboardingGate() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.profile.onboarded) return <Navigate to="/dashboard" replace />;
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Onboarding />
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<FullPageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
              {/* Server-side Google OAuth redirect target. Must stay public: the
                  cookies are set before the SPA is reached. */}
              <Route path="/auth/google/callback" element={<Suspense fallback={<FullPageLoader />}><GoogleCallback /></Suspense>} />
              <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
              {/* Password sign-in was retired from the UI: Google is the only way in.
                  The old URLs stay alive so bookmarks and emailed reset links land
                  somewhere sensible instead of a 404. */}
              <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
              <Route path="/reset-password" element={<Navigate to="/login" replace />} />
              <Route path="/onboarding" element={<OnboardingGate />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/growth" element={<GrowthHub />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/mood" element={<Mood />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/routine" element={<Routine />} />
                <Route path="/wellness" element={<Wellness />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
