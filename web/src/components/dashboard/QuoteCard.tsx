import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Quote as QuoteIcon, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';
import type { QuoteDto } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The daily quote.
 *
 * Three rules this card keeps:
 *   - the quote is chosen by the server from the date and the user id, so it is
 *     the same in every tab and on every device, and changes at local midnight;
 *   - a refresh is a genuinely different quote, because the server is told what
 *     has already been seen;
 *   - the attribution line comes from the server, so an unverified author can
 *     never be invented here.
 */
export function QuoteCard({ className }: { className?: string }) {
  const [seen, setSeen] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const daily = useQuery({
    queryKey: ['quote', 'daily'],
    queryFn: () => api.get<{ quote: QuoteDto; categories: string[] }>('/api/quotes/daily'),
    staleTime: 60 * 60_000,
  });

  const [override, setOverride] = useState<QuoteDto | null>(null);
  const quote = override ?? daily.data?.quote ?? null;

  async function refresh() {
    if (!quote || refreshing) return;
    setRefreshing(true);
    const nextSeen = [...seen, quote.id];
    try {
      const res = await api.get<{ quote: QuoteDto }>(`/api/quotes/next?seen=${encodeURIComponent(nextSeen.join(','))}`);
      setSeen(nextSeen);
      setOverride(res.quote);
    } catch {
      // The daily quote is already on screen: a failed refresh leaves it there
      // rather than emptying the card.
    } finally {
      setRefreshing(false);
    }
  }

  if (daily.isPending) {
    return (
      <Card className={cn('flex flex-col justify-between p-5', className)}>
        <div className="skeleton h-3 w-16" />
        <div className="mt-3 space-y-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-4/5" />
        </div>
      </Card>
    );
  }

  if (!quote) {
    return (
      <Card className={cn('p-5', className)}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Daily quote</p>
        <p className="mt-2 text-[12.5px] text-ink-500">The quote could not be loaded. It will appear again on the next visit.</p>
      </Card>
    );
  }

  return (
    <Card className={cn('relative flex flex-col justify-between overflow-hidden p-5', className)}>
      {/* The accent is a wash, not a distraction: one soft gradient, no motion. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ background: 'radial-gradient(120% 90% at 100% 0%, #a855f7 0%, #6366f1 45%, transparent 70%)' }}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">
            <QuoteIcon className="h-3 w-3" /> Daily quote
          </p>
          <button
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-brand-500/10"
            aria-label="Show another quote"
            title="Show another quote"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>

        <blockquote className="mt-3">
          <p className="font-display text-[15px] font-semibold leading-relaxed text-ink-900 dark:text-white">“{quote.text}”</p>
          <footer className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {/* Verified author, or the category when there is none — never a guess. */}
            <span className={cn('text-[11.5px] font-semibold', quote.author ? 'text-brand-700 dark:text-brand-300' : 'text-ink-500')}>
              {quote.attribution}
            </span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-500 dark:bg-ink-800 dark:text-ink-300">
              {quote.category}
            </span>
          </footer>
        </blockquote>
      </div>
    </Card>
  );
}
