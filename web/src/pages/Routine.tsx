import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Coffee, Download, Info, MonitorSmartphone, Moon, Save, Smartphone, Upload, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { ActivityResponse } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Skeleton, Textarea, toast } from '@/components/ui';
import { cn, formatDate, formatMinutes } from '@/lib/utils';

type Draft = {
  date: string;
  sleepMinutes: number | '';
  exerciseMinutes: number | '';
  screenMinutes: number | '';
  meditationMinutes: number | '';
  socialMinutes: number | '';
  steps: number | '';
  notes: string;
};

const FIELDS: { key: keyof Draft; label: string; icon: typeof Moon; unit: string; max: number; hint: string }[] = [
  { key: 'sleepMinutes', label: 'Sleep', icon: Moon, unit: 'min', max: 1440, hint: 'e.g. 450 for 7h 30m' },
  { key: 'exerciseMinutes', label: 'Exercise', icon: Activity, unit: 'min', max: 1440, hint: 'Movement of any kind' },
  { key: 'screenMinutes', label: 'Screen time', icon: Smartphone, unit: 'min', max: 1440, hint: 'Type it or import a CSV' },
  { key: 'meditationMinutes', label: 'Meditation', icon: Coffee, unit: 'min', max: 1440, hint: 'Optional' },
  { key: 'socialMinutes', label: 'Social time', icon: Users, unit: 'min', max: 1440, hint: 'Optional' },
];

export default function Routine() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ date: new Date().toISOString().slice(0, 10), sleepMinutes: '', exerciseMinutes: '', screenMinutes: '', meditationMinutes: '', socialMinutes: '', steps: '', notes: '' });
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');

  const query = useQuery({ queryKey: ['activity'], queryFn: () => api.get<ActivityResponse>('/api/activity?days=30') });

  useEffect(() => {
    const today = query.data?.today;
    if (!today) return;
    setDraft((d) => ({
      ...d,
      date: today.date.slice(0, 10),
      sleepMinutes: today.sleepMinutes ?? '',
      exerciseMinutes: today.exerciseMinutes ?? '',
      screenMinutes: today.screenMinutes ?? '',
      meditationMinutes: today.meditationMinutes ?? '',
      socialMinutes: today.socialMinutes ?? '',
      steps: today.steps ?? '',
      notes: today.notes ?? '',
    }));
  }, [query.data?.today]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/api/activity', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activity'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Routine logged.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const importCsv = useMutation({
    mutationFn: (text: string) => api.post<{ imported: number; errors: { line: number; message: string }[] }>('/api/activity/import', { csv: text }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['activity'] });
      toast(`Imported ${res.imported} row${res.imported === 1 ? '' : 's'}${res.errors.length ? `, ${res.errors.length} skipped` : ''}.`, res.errors.length ? 'info' : 'success');
      setImportOpen(false);
      setCsv('');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const n = (v: number | '') => (v === '' ? null : Number(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Daily routine</h1>
          <p className="mt-0.5 text-xs text-ink-500">Optional context — sleep, movement, screen time. Skip it freely; nothing breaks.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)} icon={<Upload className="h-4 w-4" />}>
          Import CSV
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/70 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
        <p className="text-[11px] leading-relaxed text-ink-500">
          A browser cannot read your phone’s screen time or health data without an explicit platform integration, so AI-LifeHub does not pretend to. Log values here in seconds, or import a CSV exported from your phone or fitness app. Values you enter are marked as <span className="font-semibold">manual</span> and never presented as device-detected.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Log today" subtitle="All fields optional — fill in only what you know" icon={<Moon className="h-4.5 w-4.5" />} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={draft.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </Field>
            <Field label="Steps (optional)">
              <Input type="number" min={0} max={200000} placeholder="e.g. 6500" value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value === '' ? '' : Number(e.target.value) })} />
            </Field>
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label} (minutes)`}>
                <Input
                  type="number"
                  min={0}
                  max={f.max}
                  placeholder={f.hint}
                  value={draft[f.key] as number | ''}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <Field label="Notes (optional)" className="mt-3">
            <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything that shaped the day" />
          </Field>
          <div className="mt-3 flex justify-end">
            <Button
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  date: draft.date,
                  sleepMinutes: n(draft.sleepMinutes),
                  exerciseMinutes: n(draft.exerciseMinutes),
                  screenMinutes: n(draft.screenMinutes),
                  meditationMinutes: n(draft.meditationMinutes),
                  socialMinutes: n(draft.socialMinutes),
                  steps: n(draft.steps),
                  notes: draft.notes || null,
                  source: 'manual',
                })
              }
              icon={<Save className="h-4 w-4" />}
            >
              Save routine
            </Button>
          </div>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <CardHeader title="30-day averages" subtitle={`${query.data?.daysLogged ?? 0} days logged`} icon={<MonitorSmartphone className="h-4.5 w-4.5" />} />
            {query.isPending ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="space-y-2">
                {[
                  { label: 'Sleep', value: query.data?.averages.sleepMinutes },
                  { label: 'Screen time', value: query.data?.averages.screenMinutes },
                  { label: 'Exercise', value: query.data?.averages.exerciseMinutes },
                  { label: 'Meditation', value: query.data?.averages.meditationMinutes },
                  { label: 'Social', value: query.data?.averages.socialMinutes },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-600 dark:text-ink-300">{row.label}</span>
                    <span className="font-bold text-ink-900 dark:text-white">{row.value == null ? '—' : formatMinutes(row.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 p-3">
            <p className="mb-1 text-[11px] font-bold text-ink-700 dark:text-ink-200">Device integrations</p>
            <p className="text-[10px] leading-relaxed text-ink-500">
              Screen-time and health APIs require a native app with platform permissions. The CSV import below is the supported bridge today; a device sync can POST to <code className="rounded bg-ink-100 px-1 dark:bg-ink-800">/api/activity</code> with <code className="rounded bg-ink-100 px-1 dark:bg-ink-800">source: "device"</code> using a user token.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader title="Recent days" subtitle="Last 30 days of routine data" />
        {query.isPending ? (
          <Skeleton className="h-40" />
        ) : query.data?.entries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] text-[10px] uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Sleep</th>
                  <th className="py-2 pr-3 font-semibold">Screen</th>
                  <th className="py-2 pr-3 font-semibold">Exercise</th>
                  <th className="py-2 pr-3 font-semibold">Meditation</th>
                  <th className="py-2 pr-3 font-semibold">Social</th>
                  <th className="py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {query.data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-[rgb(var(--border))] last:border-0">
                    <td className="py-2 pr-3 font-semibold text-ink-800 dark:text-ink-100">
                      {formatDate(new Date(e.date), { weekday: 'short' })}
                      {e.isDemo && <Badge tone="warning" className="ml-1.5">Sample</Badge>}
                    </td>
                    <td className="py-2 pr-3 text-ink-600 dark:text-ink-300">{e.sleepMinutes ? formatMinutes(e.sleepMinutes) : '—'}</td>
                    <td className="py-2 pr-3 text-ink-600 dark:text-ink-300">{e.screenMinutes ? formatMinutes(e.screenMinutes) : '—'}</td>
                    <td className="py-2 pr-3 text-ink-600 dark:text-ink-300">{e.exerciseMinutes ? formatMinutes(e.exerciseMinutes) : '—'}</td>
                    <td className="py-2 pr-3 text-ink-600 dark:text-ink-300">{e.meditationMinutes ? formatMinutes(e.meditationMinutes) : '—'}</td>
                    <td className="py-2 pr-3 text-ink-600 dark:text-ink-300">{e.socialMinutes ? formatMinutes(e.socialMinutes) : '—'}</td>
                    <td className="py-2">
                      <span className={cn('badge', e.source === 'csv' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{e.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Download className="h-5 w-5" />} title="No routine data yet" description="Log today above, or import a CSV exported from your phone or fitness app." />
        )}
      </Card>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import routine data"
        description="Paste a CSV with a header row. Dates must be YYYY-MM-DD."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button loading={importCsv.isPending} disabled={!csv.trim()} onClick={() => importCsv.mutate(csv)} icon={<Upload className="h-4 w-4" />}>
              Import
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-[rgb(var(--border))] bg-ink-50/60 p-2.5 dark:bg-ink-800/40">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">Expected format</p>
            <code className="block whitespace-pre-wrap break-all font-mono text-[10px] text-ink-600 dark:text-ink-300">
              date,sleepHours,screenHours,exerciseMinutes,meditationMinutes,socialMinutes,steps{'\n'}
              2026-10-28,7.5,3.2,30,10,45,7200{'\n'}
              2026-10-29,6.8,4.1,20,,60,5400
            </code>
          </div>
          <Field label="CSV content">
            <Textarea rows={8} className="font-mono text-[11px]" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="date,sleepHours,screenHours,..." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
