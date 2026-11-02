import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { AuthLayout, AuthLink, FormError, PasswordStrength, useFormState } from '@/components/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { toast } from '@/components/ui';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const { values, set } = useFormState({ password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.password !== values.confirm) return setError('Passwords do not match');
    if (!token) return setError('This link is missing its token. Request a new reset link.');
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password: values.password });
      toast('Password updated — sign in with your new password.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Signing in everywhere will require the new password."
      footer={
        <span>
          Need a new link? <AuthLink to="/forgot-password">Request one</AuthLink>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={values.password} onChange={set('password')} required />
          <PasswordStrength value={values.password} />
        </Field>
        <Field label="Confirm password">
          <Input type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} required />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading} icon={<KeyRound className="h-4 w-4" />}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
