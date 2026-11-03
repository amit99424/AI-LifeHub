import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, ChevronRight, MessageSquarePlus, RefreshCw, Send, Sparkles, Trash2, User, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ChatMessage, Conversation } from '@/lib/types';
import { Badge, Button, Card, EmptyState, Skeleton, Textarea, toast } from '@/components/ui';
import { AiConfigBanner } from '@/components/AiConfigBanner';
import { useAiStatus } from '@/hooks/useAiStatus';
import { cn, relativeTime } from '@/lib/utils';

const SUGGESTIONS = [
  'What should I focus on today?',
  'Analyze my last 7 days.',
  'Why am I missing my deadlines?',
  'How consistent are my habits?',
  'What are my productivity patterns?',
  'Suggest a better daily routine.',
  'Summarize my weekly progress.',
];

export default function Assistant() {
  const qc = useQueryClient();
  const { data: status } = useAiStatus();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);
  const [dataWindow, setDataWindow] = useState<{ from: string; to: string; days: number } | null>(null);
  const [availability, setAvailability] = useState<{ daysWithAnyActivity: number; missing: string[]; sufficientForPatterns: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<{ conversations: Conversation[] }>('/api/ai/conversations'),
  });

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ conversation: Conversation & { messages: ChatMessage[] } }>(`/api/ai/conversations/${id}`);
      setConversationId(id);
      setMessages(res.conversation.messages);
      setDataWindow(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = useMutation({
    mutationFn: (text: string) =>
      api.post<{
        conversationId: string;
        message: ChatMessage;
        dataWindow: { from: string; to: string; days: number };
        availability: { daysWithAnyActivity: number; missing: string[]; sufficientForPatterns: boolean };
        usage: { chatMessages: number; limits: { chatMessages: number } };
      }>('/api/ai/chat', { conversationId: conversationId ?? undefined, message: text }),
  });

  async function submit(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: 'user', content: question, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await send.mutateAsync(question);
      setConversationId(res.conversationId);
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), { ...optimistic, id: `${optimistic.id}-ok` }, res.message]);
      setDataWindow(res.dataWindow);
      setAvailability(res.availability);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      void qc.invalidateQueries({ queryKey: ['ai-status'] });
    } catch (err) {
      const e = err as { message?: string; code?: string; status?: number };
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      // Put the question back so the user can retry without retyping it.
      setInput(question);

      // An inline, dismissible error bubble beats a toast that disappears.
      const hint =
        e.code === 'ai_model_unavailable'
          ? "The server's configured AI model is no longer available. The deployment needs GEMINI_MODEL updated (a fallback is attempted automatically)."
          : e.code === 'ai_quota_exceeded'
            ? 'The Gemini quota or rate limit was hit. Wait a moment and try again.'
            : e.code === 'ai_unconfigured'
              ? 'AI is not configured on the server (AI_PROVIDER / GEMINI_API_KEY).'
              : e.status === 0
                ? 'The API did not respond — the Render free instance may be waking up. Retrying usually works.'
                : 'The assistant could not answer that. Try again.';
      setError({ message: e.message || 'Request failed', hint });
      toast(e.message || 'The assistant could not answer', 'error');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const deleteConversation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai/conversations/${id}`),
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    },
  });

  const usage = status?.usage;
  const remaining = usage ? usage.limits.chatMessages - usage.chatMessages : null;

  const sidebar = (
    <div className="space-y-2">
      <Button
        variant="secondary"
        className="w-full justify-start"
        onClick={() => {
          setConversationId(null);
          setMessages([]);
          setDataWindow(null);
          inputRef.current?.focus();
        }}
        icon={<MessageSquarePlus className="h-4 w-4" />}
      >
        New conversation
      </Button>
      <div className="space-y-1">
        {conversations.isPending && <Skeleton className="h-10 w-full" />}
        {(conversations.data?.conversations ?? []).map((c) => (
          <div key={c.id} className="group flex items-center gap-1">
            <button
              onClick={() => void loadConversation(c.id)}
              className={cn(
                'flex min-w-0 flex-1 flex-col rounded-lg px-2.5 py-2 text-left transition',
                conversationId === c.id ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-ink-100 dark:hover:bg-ink-800',
              )}
            >
              <span className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{c.title}</span>
              <span className="text-[10px] text-ink-400">{relativeTime(c.updatedAt)}</span>
            </button>
            <button
              onClick={() => deleteConversation.mutate(c.id)}
              className="rounded p-1 text-ink-300 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
              aria-label="Delete conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!conversations.isPending && (conversations.data?.conversations ?? []).length === 0 && (
          <p className="px-2.5 py-3 text-[11px] leading-relaxed text-ink-400">Conversations are saved here with their full history.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">AI assistant</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Answers grounded in your own records
            {remaining !== null ? ` · ${remaining} message${remaining === 1 ? '' : 's'} left today` : ''}
          </p>
        </div>
        {dataWindow && (
          <Badge tone="brand">
            Data window: {dataWindow.days} days ({dataWindow.from} → {dataWindow.to})
          </Badge>
        )}
      </div>

      <AiConfigBanner />

      {availability && !availability.sufficientForPatterns && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[11px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-200">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Only {availability.daysWithAnyActivity} day(s) of activity so far — the assistant will say when it lacks enough history.
            {availability.missing.length > 0 && ` Needed: ${availability.missing.slice(0, 2).join('; ')}.`}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="hidden h-fit p-3 lg:block">{sidebar}</Card>

        <Card className="flex min-h-[70vh] flex-col p-0">
          <div className="flex items-center gap-2.5 border-b border-[rgb(var(--border))] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-blue-500 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-bold text-ink-900 dark:text-white">LifeHub assistant</p>
              <p className="text-[10px] text-ink-400">
                {status?.configured ? `${status.provider}${status.model ? ` · ${status.model}` : ''}` : 'Not configured'}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="lg:hidden"
              onClick={() => {
                setConversationId(null);
                setMessages([]);
              }}
              icon={<MessageSquarePlus className="h-3.5 w-3.5" />}
            >
              New
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-8">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-blue-500 text-white shadow-glow">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h3 className="font-display text-base font-extrabold text-ink-900 dark:text-white">Ask about your own data</h3>
                <p className="mt-1 max-w-sm text-center text-xs leading-relaxed text-ink-500">
                  The assistant reads a computed summary of your tasks, habits, mood, sessions and journal — not raw tables — and tells you when there isn’t enough history to answer.
                </p>
                <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void submit(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-[11px] font-medium text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:text-ink-300 dark:hover:bg-brand-500/10"
                    >
                      {s} <ChevronRight className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cn('flex gap-2.5', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {m.role === 'assistant' && (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-blue-500 text-white">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                      m.role === 'user'
                        ? 'rounded-br-md bg-brand-600 text-white'
                        : 'rounded-bl-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-ink-700 dark:text-ink-200',
                    )}
                  >
                    {m.content}
                    {m.role === 'assistant' && m.provider && (
                      <p className="mt-1.5 text-[9px] uppercase tracking-wide text-ink-400">
                        {m.provider}
                        {m.model ? ` · ${m.model}` : ''}
                      </p>
                    )}
                  </div>
                  {m.role === 'user' && (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-200 text-ink-600 dark:bg-ink-700 dark:text-ink-200">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              ))
            )}

            {sending && (
              <div className="flex gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-blue-500 text-white">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[rgb(var(--border))] px-3.5 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                  <span className="ml-1 text-[11px] text-ink-400">reading your data — this can take up to 40s on Gemini…</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[rgb(var(--border))] p-3">
            {error && (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 text-[11px] text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{error.message}</p>
                  <p className="mt-0.5 opacity-80">{error.hint}</p>
                </div>
                <button onClick={() => setError(null)} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss error">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {!status?.configured && (
              <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300">The assistant needs an AI provider key on the server before it can answer.</p>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(input);
              }}
            >
              <Textarea
                ref={inputRef}
                rows={1}
                className="max-h-32 min-h-[42px] flex-1 py-2.5"
                placeholder="Ask about your week, your habits, your deadlines…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submit(input);
                  }
                }}
                disabled={!status?.configured || sending}
              />
              <Button type="submit" className="h-[42px]" loading={sending} disabled={!input.trim() || !status?.configured} icon={<Send className="h-4 w-4" />}>
                Send
              </Button>
            </form>
            {usage && (
              <div className="mt-2 flex items-center justify-between text-[10px] text-ink-400">
                <span>
                  {usage.chatMessages}/{usage.limits.chatMessages} messages today · {usage.tokensIn + usage.tokensOut} tokens used
                </span>
                <button onClick={() => void qc.invalidateQueries({ queryKey: ['ai-status'] })} className="inline-flex items-center gap-1 hover:text-brand-600">
                  <RefreshCw className="h-2.5 w-2.5" /> refresh
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
