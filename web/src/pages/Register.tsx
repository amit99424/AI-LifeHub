import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { AuthLayout, AuthLink, FormError, PasswordStrength, useFormState } from '@/components/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { values, set } = useFormState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.password.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true);
    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Could not create your account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Two minutes of setup, then it mostly runs itself."
      footer={
        <span>
          Already have an account? <AuthLink to="/login">Sign in</AuthLink>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Full name">
          <Input autoComplete="name" placeholder="Ada Lovelace" value={values.name} onChange={set('name')} required />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set('email')} required />
        </Field>
        <Field label="Password" hint="At least 8 characters, including a letter and a number.">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={values.password}
            onChange={set('password')}
            required
          />
          <PasswordStrength value={values.password} />
        </Field>

        <Button type="submit" className="mt-2 w-full" size="lg" loading={loading} icon={<UserPlus className="h-4 w-4" />}>
          Create account
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-ink-400">
          By creating an account you agree that AI-LifeHub stores the activity you log so it can generate your personal insights. You can export or delete everything at any time.
        </p>
      </form>
    </AuthLayout>
  );
}
