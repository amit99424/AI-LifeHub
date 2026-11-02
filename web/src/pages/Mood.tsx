import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookHeart, Info, Smile, Trash2, TrendingUp } from 'lucide-react';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import type { MoodLevel, MoodsResponse } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, Textarea, toast } from '@/components/ui';
import { MOOD_META, cn, formatDate } from '@/lib/utils';

const LEVELS: MoodLevel[] = ['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE'];

export default function Mood() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<MoodLevel | null>(null);
  const [note, setNote] = useState('');
  const [focus, setFocus] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [range, setRange] = useState(30);

  const query = useQuery({ queryKey: ['moods', range], queryFn: () => api.get<MoodsResponse>(`/api/moods?days=${range}`) });

  const save = useMutation({
    mutationFn: (level: MoodLevel) => api.post('/api/moods', { level, note: note.trim() || null, focus, energy }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['moods'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      toast('Mood saved for today.', 'success');
      setSelected(null);
      setNote('');
      setFocus(null);
      setEnergy(null);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/moods/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['moods'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Entry removed.', 'success');
    },
  });

  const data = query.data;
  const distribution = data ? Object.entries(MOOD_META).map(([k, m]) => ({ name: m.label, key: k, value: data.distribution[k as MoodLevel] ?? 0, color: m.color })).filter((d) => d.value > 0) : [];
  const series = (data?.series ?? []).map((s) => ({ date: formatDate(`${s.date}T00:00:00Z`), score: s.score }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Mood tracker</h1>
          <p className="mt-0.5 text-xs text-ink-500">One tap. Optional note. Entirely yours.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-[rgb(var(--border))] p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={cn('rounded-lg px-2.5 py-1 text-[11px] font-semibold transition', range === d ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative">
          <CardHeader
            title={data?.today ? 'Update today’s mood' : 'How are you feeling today?'}
            subtitle={data?.today ? `Currently logged as ${MOOD_META[data.today.level].label}` : 'Self-reported and private. Never used for diagnosis.'}
            icon={<Smile className="h-4.5 w-4.5" />}
          />

          <div className="grid grid-cols-5 gap-2">
            {LEVELS.map((level) => {
              const meta = MOOD_META[level];
              const active = (selected ?? data?.today?.level) === level;
              return (
                <button
                  key={level}
                  onClick={() => setSelected(level)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-3 transition active:scale-[0.98]',
                    active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-[rgb(var(--border))] hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
                  )}
                >
                  <span className="text-2xl sm:text-3xl">{meta.emoji}</span>
                  <span className={cn('text-[11px] font-bold', active ? 'text-brand-700 dark:text-brand-300' : 'text-ink-600 dark:text-ink-300')}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-4 space-y-3 animate-slide-up">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note — what shaped this mood?" rows={3} maxLength={1000} />
              <div className="grid gap-3 sm:grid-cols-2">
                <RatingRow label="Focus (optional)" value={focus} onChange={setFocus} />
                <RatingRow label="Energy (optional)" value={energy} onChange={setEnergy} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate(selected)} loading={save.isPending}>
                  Save mood
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Mood trend" subtitle={`Average ${data?.avgScore ?? '—'} / 5 across ${data?.logs.length ?? 0} entries`} icon={<TrendingUp className="h-4.5 w-4.5" />} />
            {series.some((s) => s.score !== null) ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} width={28} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" name="Mood" stroke="#7f56ff" strokeWidth={2.5} dot={{ r: 3, fill: '#7f56ff' }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={<Smile className="h-5 w-5" />} title="No mood history yet" description="Log a mood above — the trend appears after your first entry." />
            )}
          </Card>

          <Card>
            <CardHeader title="Distribution" subtitle={data?.avgScore ? `Average ${data.avgScore}/5` : 'No entries yet'} icon={<BookHeart className="h-4.5 w-4.5" />} />
            {distribution.length ? (
              <>
                <div className="mx-auto h-40 w-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distribution} dataKey="value" innerRadius={42} outerRadius={66} paddingAngle={3} stroke="none">
                        {distribution.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1.5">
                  {distribution.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-[11px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-ink-600 dark:text-ink-300">{d.name}</span>
                      <span className="ml-auto font-semibold text-ink-800 dark:text-ink-100">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-xs text-ink-400">Distribution appears once you log a few moods.</p>
            )}
          </Card>
        </div>
      )}

      {data && data.logs.length > 0 && (
        <Card>
          <CardHeader title="History" subtitle={`${data.logs.length} entries in this range`} />
          <div className="divide-y divide-[rgb(var(--border))]">
            {data.logs.slice(0, 40).map((l) => (
              <div key={l.id} className="flex items-start gap-3 py-2.5">
                <span className="text-xl">{MOOD_META[l.level].emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-bold text-ink-900 dark:text-white">{MOOD_META[l.level].label}</span>
                    <span className="text-[11px] text-ink-400">{formatDate(new Date(l.date), { weekday: 'short' })}</span>
                    {l.isDemo && <Badge tone="warning">Sample</Badge>}
                    {l.focus && <Badge tone="brand">focus {l.focus}/5</Badge>}
                    {l.energy && <Badge tone="info">energy {l.energy}/5</Badge>}
                  </div>
                  {l.note && <p className="mt-0.5 text-xs text-ink-500">{l.note}</p>}
                </div>
                <button onClick={() => remove.mutate(l.id)} className="rounded-md p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
        <p className="text-[11px] leading-relaxed text-ink-500">
          Mood data is self-reported and private to your account. AI-LifeHub may describe how mood has tended to relate to your task completion or focus time, but it describes correlation only and never offers medical or psychological advice.
        </p>
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-700 dark:text-ink-300">{label}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              'h-8 flex-1 rounded-lg border text-xs font-bold transition',
              value === n ? 'border-brand-500 bg-brand-600 text-white' : 'border-[rgb(var(--border))] text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
