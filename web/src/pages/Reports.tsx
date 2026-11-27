import { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, CalendarRange, Download, FileText, Loader2, Minus, Sparkles, Target } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, ProgressBar, Skeleton, toast } from '@/components/ui';
import { PERIOD_LABEL, downloadReportCsv, useMonthlyReview, useReport } from '@/lib/reports';
import type { ReportDto, ReportMetricDto, ReportPeriod } from '@/lib/types';
import { cn } from '@/lib/utils';

const PERIODS: ReportPeriod[] = ['day', 'week', 'month'];

/**
 * Reports: the same records at three scales, with a download and a written
 * monthly review.
 *
 * Nothing on this page is inferred. A metric with no records says "not
 * recorded" — it is never rendered as a zero, because a zero is a claim.
 */
export default function Reports() {
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const report = useReport(period);
  const review = useMonthlyReview();
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      await downloadReportCsv(period);
      toast('Report downloaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">Reports</h1>
          <p className="mt-0.5 text-xs text-ink-500">Your own records, read at day, week and month scale. Nothing is estimated.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-lg border border-[rgb(var(--border))] p-0.5" role="tablist" aria-label="Report period">
            {PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition',
                  period === p ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-100',
                )}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void download()}
            loading={downloading}
            icon={<Download className="h-3.5 w-3.5" />}
          >
            CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.print()}
            icon={<FileText className="h-3.5 w-3.5" />}
          >
            Print / PDF
          </Button>
        </div>
      </div>

      {report.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {report.isError && <ErrorState message={(report.error as Error).message} onRetry={() => void report.refetch()} />}

      {report.data && <ReportBody report={report.data} />}

      {period === 'month' && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" />
              <p className="text-[13px] font-bold text-ink-900 dark:text-white">Monthly review</p>
              {review.data && (
                <Badge tone={review.data.review.source === 'AI' ? 'brand' : 'neutral'}>
                  {review.data.review.source === 'AI' ? `AI · ${review.data.review.model ?? review.data.review.provider}` : 'Built from records'}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => review.mutate()}
              loading={review.isPending}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              {review.data ? 'Rewrite' : 'Write my review'}
            </Button>
          </div>
          <div className="px-4 py-4">
            {!review.data && !review.isPending && (
              <p className="text-[12px] leading-relaxed text-ink-500">
                This asks the assistant to read this month’s figures and write them up: what the records show, what improved, what needs
                attention, and suggested priorities. It uses only the figures above.
              </p>
            )}
            {review.isPending && (
              <div className="flex items-center gap-2 text-[12px] text-ink-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading this month’s records…
              </div>
            )}
            {review.isError && (
              <p className="text-[12px] text-rose-700 dark:text-rose-300">
                The review could not be written: {(review.error as Error).message}
              </p>
            )}
            {review.data && (
              <>
                {review.data.review.note && (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-200">
                    {review.data.review.note}
                  </p>
                )}
                <div className="space-y-2.5 text-[12.5px] leading-relaxed text-ink-700 dark:text-ink-200">
                  {review.data.review.text.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) {
                      return (
                        <p key={i} className="pt-1 font-display text-[12.5px] font-extrabold text-ink-900 dark:text-white">
                          {line.slice(3)}
                        </p>
                      );
                    }
                    if (line.startsWith('- ')) {
                      return (
                        <p key={i} className="pl-3">
                          • {line.slice(2)}
                        </p>
                      );
                    }
                    if (!line.trim()) return null;
                    return <p key={i}>{line}</p>;
                  })}
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function ReportBody({ report }: { report: ReportDto }) {
  const [showRows, setShowRows] = useState(false);
  const focus = report.metrics.filter((m) => m.key !== 'sleepHours');

  if (report.totals.daysWithData === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="Nothing was recorded in this period"
          description={`${report.range.label} has no tasks, sessions, habits or wellness records. The figures are not zero — they are absent.`}
        />
        {report.gaps.length > 0 && (
          <ul className="space-y-1 border-t border-[rgb(var(--border))] px-4 py-3">
            {report.gaps.map((g) => (
              <li key={g} className="text-[11px] text-ink-500">
                • {g}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <>
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-brand-600 dark:text-brand-300" />
            <p className="text-[13px] font-bold text-ink-900 dark:text-white">{report.range.label}</p>
            <Badge tone="neutral">
              {report.totals.daysWithData} of {report.totals.days} days recorded
            </Badge>
          </div>
          <p className="text-[10.5px] text-ink-400">
            Compared with {report.previousRange.from} to {report.previousRange.to} · generated {report.generatedAt.slice(0, 16).replace('T', ' ')}
          </p>
        </div>
        <div className="grid gap-2 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {focus.map((m) => (
            <MetricTile key={m.key} m={m} />
          ))}
        </div>
        {report.thin && (
          <p className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-200">
            Only {report.totals.daysWithData} of {report.totals.days} days have a record, so this is a list of what exists rather than a
            picture of the period.
          </p>
        )}
      </Card>

      {(report.accomplishments.length > 0 || report.needsAttention.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {report.accomplishments.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Accomplishments</p>
              <ul className="mt-1.5 space-y-1">
                {report.accomplishments.map((a) => (
                  <li key={a} className="text-[12px] leading-relaxed text-ink-700 dark:text-ink-200">
                    • {a}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {report.needsAttention.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Needs attention</p>
              <ul className="mt-1.5 space-y-1">
                {report.needsAttention.map((a) => (
                  <li key={a} className="text-[12px] leading-relaxed text-ink-700 dark:text-ink-200">
                    • {a}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {report.goals.length > 0 && (
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <Target className="h-3 w-3" /> Goals
          </p>
          <div className="mt-2 space-y-2.5">
            {report.goals.map((g) => (
              <div key={g.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{g.title}</p>
                  <p className="shrink-0 text-[11px] text-ink-500">
                    {g.current ?? 'not recorded'} / {g.target ?? 'no target'}
                    {g.metric ? ` ${g.metric}` : ''}
                  </p>
                </div>
                {g.fraction === null ? (
                  <p className="mt-0.5 text-[10.5px] text-ink-400">No target number, so no percentage can be computed.</p>
                ) : (
                  <ProgressBar value={Math.round(g.fraction * 100)} className="mt-1" />
                )}
                <p className="mt-0.5 text-[10.5px] text-ink-400">
                  {g.milestonesDone}/{g.milestonesTotal} milestones
                  {g.deadline ? ` · due ${g.deadline}` : ' · no deadline'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(report.projects.length > 0 || report.skills.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {report.projects.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Projects in this period</p>
              <ul className="mt-2 space-y-1.5">
                {report.projects.map((p) => (
                  <li key={p.id} className="text-[12px] text-ink-700 dark:text-ink-200">
                    <span className="font-semibold">{p.title}</span> — {p.tasksDone}/{p.tasksTotal} tasks done, {p.minutes} min
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {report.skills.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Skills practised</p>
              <ul className="mt-2 space-y-1.5">
                {report.skills.map((s) => (
                  <li key={s.id} className="text-[12px] text-ink-700 dark:text-ink-200">
                    <span className="font-semibold">{s.name}</span> — {s.level}, {s.practiceMinutes} min on {s.practiceDays} day(s)
                    {s.levelsGained > 0 ? `, ${s.levelsGained} level change(s)` : ''}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {report.gaps.length > 0 && (
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <AlertTriangle className="h-3 w-3" /> Not recorded
          </p>
          <ul className="mt-1.5 space-y-1">
            {report.gaps.map((g) => (
              <li key={g} className="text-[11.5px] leading-relaxed text-ink-500">
                • {g}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        <button
          onClick={() => setShowRows((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={showRows}
        >
          <span className="text-[12.5px] font-bold text-ink-900 dark:text-white">Day-by-day rows</span>
          <span className="text-[11px] text-ink-400">{showRows ? 'Hide' : `Show ${report.rows.length}`}</span>
        </button>
        {showRows && (
          <div className="overflow-x-auto border-t border-[rgb(var(--border))]">
            <table className="w-full text-[11px]">
              <thead className="bg-[rgb(var(--surface))] text-ink-400">
                <tr>
                  {['Date', 'Tasks done', 'Focus min', 'Habits', 'Mood', 'Stress', 'Energy', 'Sleep q'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.date} className="border-t border-[rgb(var(--border))]">
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-ink-700 dark:text-ink-200">{r.date}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.tasksCompleted ?? '—'}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.focusMinutes ?? '—'}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.habitCheckins ?? '—'}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.mood ?? '—'}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.stress ?? '—'}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.energy ?? '—'}</td>
                    <td className="px-2.5 py-1.5 tabular-nums">{r.sleepQuality ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function MetricTile({ m }: { m: ReportMetricDto }) {
  const Icon = m.change === null ? Minus : m.change > 0 ? ArrowUp : m.change < 0 ? ArrowDown : Minus;
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{m.label}</p>
      <p className={cn('mt-0.5 font-display text-[18px] font-extrabold tabular-nums', m.recorded ? 'text-ink-900 dark:text-white' : 'text-ink-400')}>
        {m.value === null ? 'Not recorded' : `${m.value}${m.unit ? ` ${m.unit}` : ''}`}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-400">
        {m.change === null ? (
          'no previous period to compare'
        ) : (
          <>
            <Icon className="h-2.5 w-2.5" />
            {m.change > 0 ? '+' : ''}
            {m.change} vs previous ({m.previous})
          </>
        )}
      </p>
    </div>
  );
}
