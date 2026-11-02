import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bot, KeyRound, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useAiStatus } from '@/hooks/useAiStatus';
import { cn } from '@/lib/utils';

/** Shown wherever an AI module is present but the deployment has no API key. */
export function AiConfigBanner({ compact, className }: { compact?: boolean; className?: string }) {
  const { data, isLoading, refetch, isFetching } = useAiStatus();
  if (isLoading || !data) return null;

  if (!data.configured) {
    return (
      <div className={cn('overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/5', className)}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <KeyRound className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-display text-sm font-bold text-amber-900 dark:text-amber-200">AI is not configured</h4>
              <Badge tone="warning">Setup required</Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
              Everything else in AI-LifeHub works. Insights and the assistant need a provider key on the server.
              {!compact && (
                <>
                  {' '}Add <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-500/15">AI_PROVIDER</code> and{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-500/15">GEMINI_API_KEY</code> (or{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-500/15">OPENAI_API_KEY</code>) to{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-500/15">server/.env</code> and restart the API.
                </>
              )}
            </p>
            {data.missingEnv.length > 0 && (
              <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300/80">Missing: {data.missingEnv.join(', ')}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/70 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 transition hover:bg-white dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Recheck
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data.userEnabled) {
    return (
      <div className={cn('flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4', className)}>
        <AlertTriangle className="h-4 w-4 shrink-0 text-ink-400" />
        <p className="text-xs text-ink-600 dark:text-ink-300">
          AI features are switched off in your settings.{' '}
          <Link to="/settings" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Turn them back on <ArrowRight className="inline h-3 w-3" />
          </Link>
        </p>
      </div>
    );
  }

  if (compact) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]/60 px-3 py-2 text-[11px] text-ink-500', className)}>
      <Sparkles className="h-3.5 w-3.5 text-brand-500" />
      <span>
        Powered by <span className="font-semibold text-ink-700 dark:text-ink-200">{data.provider}</span>
        {data.model ? ` · ${data.model}` : ''}
      </span>
      <span className="text-ink-300">|</span>
      <Bot className="h-3.5 w-3.5" />
      <span>
        {data.usage.chatMessages}/{data.usage.limits.chatMessages} assistant messages today
      </span>
    </div>
  );
}
