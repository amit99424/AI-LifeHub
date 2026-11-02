import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Database, Download, KeyRound, LogOut, Monitor, Moon, Palette, Save, Shield, Sparkles, Sun, Trash2, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, useProfile, useTheme, useUpdateProfile, useUpdateSettings, type ThemeMode } from '@/lib/auth';
import type { AiStatus } from '@/lib/types';
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Skeleton, Textarea, toast } from '@/components/ui';
import { cn, formatDate, relativeTime } from '@/lib/utils';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

export default function Settings() {
  const qc = useQueryClient();
  const { user, logout, refreshUser } = useAuth();
  const { mode, setMode } = useTheme();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateSettings();

  const [form, setForm] = useState({ name: '', occupation: '', primaryGoal: '', timezone: 'UTC', weekStart: 1, bio: '' });
  const [demoModal, setDemoModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatus>('/api/ai/status') });
  const sessions = useQuery({ queryKey: ['sessions-list'], queryFn: () => api.get<{ sessions: { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastSeenAt: string; current: boolean }[] }>('/api/auth/sessions') });

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      name: p.user.name,
      occupation: p.profile.occupation ?? '',
      primaryGoal: p.profile.primaryGoal ?? '',
      timezone: p.profile.timezone,
      weekStart: p.profile.weekStart,
      bio: p.profile.bio ?? '',
    });
  }, [profile.data]);

  const saveProfile = useMutation({
    mutationFn: () => updateProfile.mutateAsync({ ...form, occupation: form.occupation || null, primaryGoal: form.primaryGoal || null, bio: form.bio || null }),
    onSuccess: () => toast('Profile updated.', 'success'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const loadDemo = useMutation({
    mutationFn: () => api.post('/api/users/demo-data'),
    onSuccess: () => {
      void qc.invalidateQueries();
      void refreshUser();
      setDemoModal(false);
      toast('Sample data loaded and labelled.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const clearDemo = useMutation({
    mutationFn: () => api.delete('/api/users/demo-data'),
    onSuccess: () => {
      void qc.invalidateQueries();
      void refreshUser();
      toast('All sample data removed.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const res = await api.raw('/api/users/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-lifehub-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast('Your data export has been downloaded.', 'success'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.delete('/api/users/account', { confirm: 'DELETE' }),
    onSuccess: async () => {
      toast('Account deleted.', 'success');
      await logout();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/api/auth/sessions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions-list'] });
      toast('Session revoked.', 'success');
    },
  });

  const revokeAll = useMutation({
    mutationFn: () => api.post('/api/auth/sessions/revoke-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions-list'] });
      toast('Other sessions signed out.', 'success');
    },
  });

  const theme = user?.settings.theme ?? 'system';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Settings</h1>
        <p className="mt-0.5 text-xs text-ink-500">Profile, appearance, AI behaviour, privacy and data.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" subtitle="Used to tailor insights, never shared" icon={<User className="h-4.5 w-4.5" />} />
            {profile.isPending ? (
              <Skeleton className="h-48" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Email" hint="Contact support to change your sign-in email.">
                  <Input value={user?.email ?? ''} disabled />
                </Field>
                <Field label="Occupation">
                  <Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Student, Engineer…" />
                </Field>
                <Field label="Primary goal">
                  <Input value={form.primaryGoal} onChange={(e) => setForm({ ...form, primaryGoal: e.target.value })} placeholder="Build consistency" />
                </Field>
                <Field label="Timezone" hint="Controls which calendar day a habit check-in or mood belongs to.">
                  <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                    {[form.timezone, ...TIMEZONES.filter((t) => t !== form.timezone)].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Week starts on">
                  <Select value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: Number(e.target.value) })}>
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                  </Select>
                </Field>
                <Field label="Short bio (optional)" className="sm:col-span-2">
                  <Textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={500} />
                </Field>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate()} icon={<Save className="h-4 w-4" />}>
                Save profile
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Appearance" subtitle="Theme applies to this browser immediately" icon={<Palette className="h-4.5 w-4.5" />} />
            <div className="grid grid-cols-3 gap-2">
              {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => {
                const Icon = m === 'light' ? Sun : m === 'dark' ? Moon : Monitor;
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      updateSettings.mutate({ theme: m });
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 text-[12px] font-semibold capitalize transition',
                      active ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'border-[rgb(var(--border))] text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {m}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="AI preferences" subtitle="Control how the assistant behaves" icon={<Sparkles className="h-4.5 w-4.5" />} />
            <div className="space-y-2">
              <Toggle
                label="AI features enabled"
                description="Turn off to hide assistant answers and insight generation."
                checked={user?.settings.aiEnabled ?? true}
                onChange={(v) => updateSettings.mutate({ aiEnabled: v })}
              />
              <Toggle
                label="Automatic daily insights"
                description="Allow AI-LifeHub to generate a summary when you open the dashboard."
                checked={user?.settings.aiAutoInsights ?? true}
                onChange={(v) => updateSettings.mutate({ aiAutoInsights: v })}
              />
              <Toggle
                label="Mood tracking"
                description="Show the mood tracker module. Mood is always optional."
                checked={user?.settings.moodTrackingOptIn ?? true}
                onChange={(v) => updateSettings.mutate({ moodTrackingOptIn: v })}
              />
            </div>
            <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-ink-50/60 p-3 dark:bg-ink-800/40">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <KeyRound className="h-3.5 w-3.5 text-ink-400" />
                <span className="font-semibold text-ink-700 dark:text-ink-200">Provider</span>
                <Badge tone={aiStatus.data?.configured ? 'success' : 'warning'}>{aiStatus.data?.provider ?? '…'}</Badge>
                {aiStatus.data?.model && <span className="text-ink-500">{aiStatus.data.model}</span>}
                {aiStatus.data?.usage && (
                  <span className="ml-auto text-ink-500">
                    {aiStatus.data.usage.chatMessages}/{aiStatus.data.usage.limits.chatMessages} messages · {aiStatus.data.usage.insights}/{aiStatus.data.usage.limits.insights} insights today
                  </span>
                )}
              </div>
              {aiStatus.data && !aiStatus.data.configured && (
                <p className="mt-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
                  Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/15">AI_PROVIDER</code> and a matching key in <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/15">server/.env</code>. Missing: {aiStatus.data.missingEnv.join(', ')}.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Security" subtitle="Active sessions" icon={<Shield className="h-4.5 w-4.5" />} />
            {sessions.isPending ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="space-y-2">
                {(sessions.data?.sessions ?? []).map((s) => (
                  <div key={s.id} className="flex items-start gap-2 rounded-lg border border-[rgb(var(--border))] p-2.5">
                    <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-ink-800 dark:text-ink-100">{s.current ? 'This device' : (s.userAgent ?? 'Unknown device').slice(0, 42)}</p>
                      <p className="text-[10px] text-ink-400">last active {relativeTime(s.lastSeenAt)}</p>
                    </div>
                    {!s.current && (
                      <button onClick={() => revokeSession.mutate(s.id)} className="text-[10px] font-semibold text-rose-600 hover:underline">
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="secondary" className="flex-1" loading={revokeAll.isPending} onClick={() => revokeAll.mutate()} icon={<LogOut className="h-3.5 w-3.5" />}>
                    Sign out others
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Sample data" subtitle="For exploring AI features" icon={<Database className="h-4.5 w-4.5" />} />
            <p className="text-[11px] leading-relaxed text-ink-500">
              Loading sample data adds 45 days of clearly labelled demo records. It never overwrites your real entries and can be removed in one click.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDemoModal(true)} loading={loadDemo.isPending}>
                {user?.settings.demoDataLoaded ? 'Reload sample data' : 'Load sample data'}
              </Button>
              {user?.settings.demoDataLoaded && (
                <Button size="sm" variant="ghost" onClick={() => clearDemo.mutate()} loading={clearDemo.isPending} icon={<Trash2 className="h-3.5 w-3.5" />}>
                  Remove all sample data
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Privacy & data" subtitle="You own everything here" icon={<Shield className="h-4.5 w-4.5" />} />
            <div className="space-y-2">
              <Button size="sm" variant="secondary" className="w-full justify-start" loading={exportData.isPending} onClick={() => exportData.mutate()} icon={<Download className="h-3.5 w-3.5" />}>
                Export all my data (JSON)
              </Button>
              <Button size="sm" variant="ghost" className="w-full justify-start text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => setDeleteModal(true)} icon={<Trash2 className="h-3.5 w-3.5" />}>
                Delete my account
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={demoModal}
        onClose={() => setDemoModal(false)}
        title="Load sample data?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDemoModal(false)}>
              Cancel
            </Button>
            <Button loading={loadDemo.isPending} onClick={() => loadDemo.mutate()}>
              Load sample data
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          This creates synthetic tasks, habits, moods, sessions, routine rows and journal entries from the last 45 days so you can try the analytics and AI features immediately. Every record is flagged <span className="font-semibold">Sample</span> in the UI.
        </p>
      </Modal>

      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete your account"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleteText !== 'DELETE'} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>Every task, habit log, mood entry, journal entry, session, insight and conversation is permanently deleted. This cannot be undone.</p>
          </div>
          <Field label="Type DELETE to confirm">
            <Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800/50">
      <div className={cn('mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition', checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700')}>
        <div className={cn('h-4 w-4 rounded-full bg-white shadow transition', checked && 'translate-x-4')} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-ink-800 dark:text-ink-100">{label}</p>
        <p className="text-[10px] leading-relaxed text-ink-500">{description}</p>
      </div>
      {checked && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />}
    </button>
  );
}
