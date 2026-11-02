import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[rgb(var(--bg))] px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        <Compass className="h-7 w-7" />
      </div>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">That route does not exist in AI-LifeHub. Head back to your dashboard.</p>
      <Link to="/dashboard" className="btn-primary mt-6 h-10 px-4 text-[13px]">
        <Home className="h-4 w-4" /> Back to dashboard
      </Link>
    </div>
  );
}
