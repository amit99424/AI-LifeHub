/**
 * LLM provider abstraction.
 *
 * Supports Gemini (generateContent) and OpenAI (chat/completions) plus an
 * explicit "unconfigured" mode. There is deliberately NO mock/fake branch:
 * when credentials are missing every AI endpoint returns a structured
 * `ai_unconfigured` error that the UI renders as a configuration notice.
 */
import { config, AI_MODE } from '../config.js';

export class AIUnconfiguredError extends Error {
  code = 'ai_unconfigured';
  constructor() {
    super(
      'AI features are not configured. Set AI_PROVIDER and the matching API key (GEMINI_API_KEY or OPENAI_API_KEY) in server/.env.',
    );
  }
}

export class AIProviderError extends Error {
  code = 'ai_provider_error';
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResult {
  text: string;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * Model fallback chain.
 *
 * Google retires model ids for new API keys without warning (e.g.
 * `gemini-2.5-flash` now returns 404 "no longer available to new users"), and
 * the newest ids can be temporarily overloaded (503). A single hard-coded model
 * therefore breaks the whole AI surface on a config that "looks correct".
 *
 * Strategy: try the configured model first, then AI_MODEL_FALLBACKS. Remember
 * the first model that answers so subsequent calls skip the dead ones.
 */
let resolvedModel: string | null = null;

function modelChain(): string[] {
  const chain = [config.aiModel, ...config.AI_MODEL_FALLBACKS].filter(Boolean);
  const unique = [...new Set(chain)];
  if (resolvedModel && unique.includes(resolvedModel)) {
    return [resolvedModel, ...unique.filter((m) => m !== resolvedModel)];
  }
  return unique;
}

/** Exposed for the health endpoint so operators can see which model is in use. */
export function activeModel(): string {
  return resolvedModel ?? config.aiModel;
}

/**
 * Gemini 3.x models reason internally before answering, which pushed replies to
 * 30-45 s. `thinkingConfig.thinkingLevel` lowers that to ~18-22 s. Note the newer
 * `thinkingBudget: 0` form is rejected with 400 by these models - use levels.
 * Models that do not understand the field ignore it.
 */
function geminiThinking(model: string): Record<string, unknown> {
  const level = (process.env.AI_THINKING_LEVEL ?? 'MINIMAL').toUpperCase();
  if (level === 'OFF') return {};
  if (!/^gemini-3\./.test(model)) return {};
  return { thinkingConfig: { thinkingLevel: level } };
}

function isModelUnavailable(status: number, message: string): boolean {
  if (status === 404) return true;
  if (status === 503) return true; // temporarily overloaded - try the next model
  return /no longer available|not found|not supported|unsupported model/i.test(message);
}

export function aiStatus() {
  return {
    configured: AI_MODE !== 'unconfigured',
    provider: AI_MODE,
    // `model` is what the provider actually answered with (may differ from the
    // configured id if the fallback chain kicked in); `configuredModel` is the env value.
    model: AI_MODE === 'unconfigured' ? null : activeModel(),
    configuredModel: AI_MODE === 'unconfigured' ? null : config.aiModel,
    missingEnv:
      AI_MODE === 'unconfigured'
        ? config.AI_PROVIDER === 'none'
          ? ['AI_PROVIDER']
          : [config.AI_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY']
        : [],
  };
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** Rough token estimate (chars/4) — used for prompt budgeting, not billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…[truncated]`;
}

function describeFetchError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e?.name === 'AbortError') return 'The AI request timed out';
  const cause = e?.cause?.code || e?.cause?.message;
  if (cause) return `Could not reach the AI provider (${cause})`;
  return e?.message || 'Network error while contacting the AI provider';
}

/** POST with one retry on transient network failures / 5xx / 429. */
async function postWithRetry(url: string, init: () => RequestInit, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(url, init());
    // 4xx answers (bad model, bad key, malformed request) are deterministic:
    // retrying only doubles the latency the user waits for.
    if ((res.status >= 500 || res.status === 429) && attempt < 1) {
      await new Promise((r) => setTimeout(r, 900));
      return postWithRetry(url, init, attempt + 1);
    }
    return res;
  } catch (err) {
    if (attempt < 1 && (err as { name?: string })?.name !== 'AbortError') {
      await new Promise((r) => setTimeout(r, 900));
      return postWithRetry(url, init, attempt + 1);
    }
    throw new AIProviderError(describeFetchError(err));
  }
}

async function callGeminiOnce(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResult> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const { signal, cancel } = withTimeout(opts.timeoutMs ?? config.AI_REQUEST_TIMEOUT_MS);
  try {
    const res = await postWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.aiKey)}`,
      () => ({
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(system
            ? { systemInstruction: { parts: [{ text: system }] } }
            : {}),
          generationConfig: {
            temperature: opts.temperature ?? config.AI_TEMPERATURE,
            maxOutputTokens: opts.maxTokens ?? 1600,
            ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            ...geminiThinking(model),
          },
        }),
      }),
    );
    const body = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      error?: { message?: string; status?: string; code?: number };
    };
    if (!res.ok) {
      throw new AIProviderError(body?.error?.message || `Gemini request failed (${res.status})`, res.status);
    }
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) {
      throw new AIProviderError(
        `Gemini returned an empty response${body.candidates?.[0]?.finishReason ? ` (${body.candidates[0].finishReason})` : ''}`,
      );
    }
    return {
      text,
      provider: 'gemini',
      model,
      tokensIn: body.usageMetadata?.promptTokenCount,
      tokensOut: body.usageMetadata?.candidatesTokenCount,
    };
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    const msg = err instanceof Error && err.name === 'AbortError' ? 'AI request timed out' : (err as Error).message;
    throw new AIProviderError(msg);
  } finally {
    cancel();
  }
}

/** Tries each model in the chain until one answers. */
async function callGemini(messages: LLMMessage[], opts: LLMOptions): Promise<LLMResult> {
  const chain = modelChain();
  const failures: string[] = [];

  for (const model of chain) {
    try {
      const result = await callGeminiOnce(model, messages, opts);
      if (resolvedModel !== model) {
        resolvedModel = model;
        // eslint-disable-next-line no-console
        console.log(`[ai] using Gemini model "${model}"`);
      }
      return result;
    } catch (err) {
      const providerErr = err instanceof AIProviderError ? err : null;
      const status = providerErr?.status ?? 0;
      const message = (err as Error).message;
      failures.push(`${model}: ${message}`);
      // Only a "this model does not exist here" answer justifies moving on.
      if (!isModelUnavailable(status, message)) throw err;
    }
  }

  throw new AIProviderError(
    `No Gemini model from the configured chain could be used. Tried ${chain.join(', ')}. ` +
      `Update GEMINI_MODEL or AI_MODEL_FALLBACKS. Last error: ${failures.at(-1) ?? 'unknown'}`,
    chain.length ? 404 : 500,
  );
}

async function callOpenAI(messages: LLMMessage[], opts: LLMOptions): Promise<LLMResult> {
  const { signal, cancel } = withTimeout(opts.timeoutMs ?? config.AI_REQUEST_TIMEOUT_MS);
  try {
    const res = await postWithRetry(`${config.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, () => ({
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
        temperature: opts.temperature ?? config.AI_TEMPERATURE,
        max_tokens: opts.maxTokens ?? 1600,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    }));
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (!res.ok) throw new AIProviderError(body?.error?.message || `OpenAI request failed (${res.status})`, res.status);
    const text = body.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new AIProviderError('OpenAI returned an empty response');
    return {
      text,
      provider: 'openai',
      model: config.aiModel,
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
    };
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    const msg = err instanceof Error && err.name === 'AbortError' ? 'AI request timed out' : (err as Error).message;
    throw new AIProviderError(msg);
  } finally {
    cancel();
  }
}

export interface LLMOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function complete(messages: LLMMessage[], opts: LLMOptions = {}): Promise<LLMResult> {
  if (AI_MODE === 'unconfigured') throw new AIUnconfiguredError();
  if (AI_MODE === 'openai') return callOpenAI(messages, opts);
  return callGemini(messages, opts);
}

/** Parses JSON out of an LLM reply, tolerating ```json fences and prose wrappers. */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new AIProviderError('The model returned malformed JSON');
  }
}
