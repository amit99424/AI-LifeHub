import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { AuthLayout, AuthLink, FormError, useFormState } from '@/components/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { values, set } = useFormState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(values.email.trim(), values.password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Could not sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where your data left off."
      footer={
        <span>
          New here? <AuthLink to="/register">Create an account</AuthLink>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email">
          <Input type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set('email')} required />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={values.password}
              onChange={set('password')}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between pt-1">
          <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading} icon={<LogIn className="h-4 w-4" />}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
