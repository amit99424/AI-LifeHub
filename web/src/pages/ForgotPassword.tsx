import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { AuthLayout, AuthLink, FormError, useFormState } from '@/components/AuthLayout';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

export default function ForgotPassword() {
  const { values, set } = useFormState({ email: '' });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ message: string; resetUrl?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ message: string; resetUrl?: string }>('/api/auth/forgot-password', { email: values.email.trim() });
      setSent(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll create a single-use link valid for one hour."
      footer={
        <span>
          Remembered it? <AuthLink to="/login">Back to sign in</AuthLink>
        </span>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{sent.message}</p>
          </div>
          {sent.resetUrl && (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Development link</p>
              <p className="text-[11px] leading-relaxed text-ink-500">No mail provider is configured in this deployment, so the link is shown here instead of being emailed.</p>
              <a href={sent.resetUrl} className="mt-2 block break-all rounded-lg bg-brand-50 px-2 py-1.5 font-mono text-[11px] text-brand-700 hover:underline dark:bg-brand-500/10 dark:text-brand-300">
                {sent.resetUrl}
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="Email">
            <Input type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set('email')} required />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={loading} icon={<Send className="h-4 w-4" />}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
