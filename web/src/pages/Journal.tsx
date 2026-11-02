import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Loader2, Pencil, Plus, Quote, Search, Sparkles, Tag, Trash2, Wand2 } from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { JournalEntry, JournalResponse } from '@/lib/types';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, Skeleton, Textarea, toast } from '@/components/ui';
import { AiConfigBanner } from '@/components/AiConfigBanner';
import { cn, formatDate, todayIsoLocal } from '@/lib/utils';

const SENTIMENT_STYLES: Record<string, string> = {
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  negative: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  mixed: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
};

export default function Journal() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [composer, setComposer] = useState<{ id?: string; title: string; content: string; date: string } | null>(null);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [open, setOpen] = useState<JournalEntry | null>(null);

  const query = useQuery({
    queryKey: ['journal', search],
    queryFn: () => api.get<JournalResponse>(`/api/journal${qs({ search: search || undefined, limit: 50 })}`),
  });

  const themes = useQuery({
    queryKey: ['journal-themes'],
    queryFn: () => api.get<{ themes: { theme: string; count: number }[]; analyzed: number; total: number }>('/api/journal/insights/themes'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['journal'] });
    void qc.invalidateQueries({ queryKey: ['journal-themes'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const save = useMutation({
    mutationFn: (body: { id?: string; title: string; content: string; date: string }) =>
      body.id
        ? api.patch(`/api/journal/${body.id}`, { title: body.title || null, content: body.content, date: body.date })
        : api.post('/api/journal', { title: body.title || null, content: body.content, date: body.date }),
    onSuccess: () => {
      invalidate();
      toast('Entry saved privately.', 'success');
      setComposer(null);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/journal/${id}`),
    onSuccess: () => {
      invalidate();
      toast('Entry deleted.', 'success');
      setDeleting(null);
      setOpen(null);
    },
  });

  const analyze = useMutation({
    mutationFn: (id: string) => api.post<{ entry: JournalEntry }>(`/api/journal/${id}/analyze`),
    onSuccess: (res) => {
      invalidate();
      if (open?.id === res.entry.id) setOpen(res.entry);
      toast('Analysis complete — sentiment, themes and summary saved.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const entries = query.data?.entries ?? [];
  const grouped = entries.reduce<Record<string, JournalEntry[]>>((acc, e) => {
    const key = e.date.slice(0, 7);
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Journal</h1>
          <p className="mt-0.5 text-xs text-ink-500">Private by default · {query.data?.total ?? 0} entries</p>
        </div>
        <Button size="sm" onClick={() => setComposer({ title: '', content: '', date: todayIsoLocal() })} icon={<Plus className="h-4 w-4" />}>
          New entry
        </Button>
      </div>

      <AiConfigBanner compact />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input className="pl-9" placeholder="Search your entries…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {query.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title={search ? 'No entries match that search' : 'Your journal is empty'}
              description={search ? 'Try a different word.' : 'Write when you feel like it — the AI can then surface themes, sentiment and productivity notes across your entries.'}
              action={
                !search && (
                  <Button size="sm" onClick={() => setComposer({ title: '', content: '', date: todayIsoLocal() })} icon={<Plus className="h-3.5 w-3.5" />}>
                    Write your first entry
                  </Button>
                )
              }
            />
          ) : (
            Object.entries(grouped).map(([month, list]) => (
              <div key={month}>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="space-y-2">
                  {list.map((e) => (
                    <Card key={e.id} className="cursor-pointer p-4 transition hover:-translate-y-0.5 hover:shadow-lift" onClick={() => setOpen(e)}>
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                          <span className="text-[13px] font-extrabold leading-none">{new Date(e.date).getUTCDate()}</span>
                          <span className="text-[8px] font-bold uppercase leading-none">{new Date(e.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="text-[13px] font-bold text-ink-900 dark:text-white">{e.title || 'Untitled entry'}</h4>
                            {e.sentiment && <span className={cn('badge', SENTIMENT_STYLES[e.sentiment])}>{e.sentiment}</span>}
                            {e.isDemo && <Badge tone="warning">Sample</Badge>}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{e.summary || e.content}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-ink-400">{e.wordCount} words</span>
                            {e.themes.slice(0, 4).map((t) => (
                              <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                                <Tag className="h-2.5 w-2.5" /> {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <Card className="p-4">
            <CardHeader title="Themes" subtitle={`${themes.data?.analyzed ?? 0} of ${themes.data?.total ?? 0} entries analysed`} icon={<Tag className="h-4.5 w-4.5" />} />
            {themes.data?.themes.length ? (
              <div className="flex flex-wrap gap-1.5">
                {themes.data.themes.map((t) => (
                  <span key={t.theme} className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--border))] px-2 py-1 text-[10px] font-semibold text-ink-600 dark:text-ink-300">
                    {t.theme}
                    <span className="rounded-full bg-ink-100 px-1 text-[9px] text-ink-500 dark:bg-ink-800">{t.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-ink-400">Analyse an entry and recurring themes appear here.</p>
            )}
          </Card>

          {query.data && Object.keys(query.data.sentimentMix).length > 0 && (
            <Card className="p-4">
              <CardHeader title="Sentiment mix" subtitle="Across analysed entries" />
              <div className="space-y-1.5">
                {Object.entries(query.data.sentimentMix).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-[11px]">
                    <span className={cn('badge', SENTIMENT_STYLES[k])}>{k}</span>
                    <span className="ml-auto font-semibold text-ink-700 dark:text-ink-200">{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 p-3">
            <p className="text-[10px] leading-relaxed text-ink-500">
              Journal entries are stored against your account only. AI analysis reads the entry text on the server, returns sentiment, themes and a short summary, and never presents those as a clinical assessment.
            </p>
          </div>
        </div>
      </div>

      {/* composer */}
      <Modal
        open={!!composer}
        onClose={() => setComposer(null)}
        title={composer?.id ? 'Edit entry' : 'New journal entry'}
        description="Editing the text clears any previous AI analysis so it can be re-run."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposer(null)}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!composer?.content.trim()} onClick={() => composer && save.mutate(composer)}>
              Save entry
            </Button>
          </>
        }
      >
        {composer && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
              <Field label="Title (optional)">
                <Input value={composer.title} onChange={(e) => setComposer({ ...composer, title: e.target.value })} placeholder="Give the day a name" />
              </Field>
              <Field label="Date">
                <Input type="date" value={composer.date} max={todayIsoLocal()} onChange={(e) => setComposer({ ...composer, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Entry">
              <Textarea rows={12} value={composer.content} onChange={(e) => setComposer({ ...composer, content: e.target.value })} placeholder="What happened? What worked, what got in the way?" />
            </Field>
            <p className="text-[11px] text-ink-400">{composer.content.split(/\s+/).filter(Boolean).length} words</p>
          </div>
        )}
      </Modal>

      {/* reader */}
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title || 'Journal entry'}
        description={open ? formatDate(new Date(open.date), { weekday: 'long', year: 'numeric' }) : undefined}
        size="lg"
        footer={
          open && (
            <>
              <Button variant="ghost" onClick={() => setDeleting(open)} icon={<Trash2 className="h-3.5 w-3.5" />}>
                Delete
              </Button>
              <Button
                variant="secondary"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => {
                  setComposer({ id: open.id, title: open.title ?? '', content: open.content, date: open.date.slice(0, 10) });
                  setOpen(null);
                }}
              >
                Edit
              </Button>
              <Button loading={analyze.isPending} onClick={() => analyze.mutate(open.id)} icon={<Wand2 className="h-3.5 w-3.5" />}>
                {open.analyzedAt ? 'Re-analyse' : 'Analyse with AI'}
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700 dark:text-ink-200">{open.content}</p>

            {open.analyzedAt ? (
              <div className="space-y-2.5 rounded-xl border border-[rgb(var(--border))] bg-ink-50/60 p-3.5 dark:bg-ink-800/40">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">AI analysis</span>
                  {open.sentiment && <span className={cn('badge', SENTIMENT_STYLES[open.sentiment])}>{open.sentiment}</span>}
                  {open.sentimentScore != null && <span className="text-[10px] text-ink-400">score {open.sentimentScore.toFixed(2)}</span>}
                </div>
                {open.summary && (
                  <p className="flex gap-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" /> {open.summary}
                  </p>
                )}
                {open.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {open.themes.map((t) => (
                      <Badge key={t} tone="brand">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                {open.productivityNotes && <p className="text-[11px] leading-relaxed text-ink-500">Productivity: {open.productivityNotes}</p>}
                <p className="text-[10px] text-ink-400">Text-based sentiment analysis, not a psychological assessment.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))] px-3.5 py-3">
                <Loader2 className="h-3.5 w-3.5 text-ink-400" />
                <p className="text-[11px] text-ink-500">Not analysed yet. Run the analysis to get sentiment, themes and a short summary.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete entry?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete entry
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600 dark:text-ink-300">This entry will be permanently deleted from your account.</p>
      </Modal>
    </div>
  );
}
