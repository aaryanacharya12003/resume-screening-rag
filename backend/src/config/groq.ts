import OpenAI from 'openai';
import dotenv from 'dotenv';

type CreateParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

dotenv.config();

export const GROQ_CHAT_MODEL = 'openai/gpt-oss-120b';

// GROQ_API_KEY plus any comma-separated GROQ_API_KEYS. Each key has its own rate limit
// (free tier: 8k tokens/min), so rotating across them multiplies the headroom.
const keys = [process.env.GROQ_API_KEY, ...(process.env.GROQ_API_KEYS ?? '').split(',')]
  .map((k) => k?.trim())
  .filter((k, i, all): k is string => !!k && all.indexOf(k) === i);

if (!keys.length) console.warn('⚠ No Groq API key configured (GROQ_API_KEY / GROQ_API_KEYS)');

const clients = keys.map(
  (apiKey) => new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 0 }),
);

// Fallback: when Groq fails a request twice (rate limits, rejected keys, outages), the request
// goes to OpenRouter instead. Same model by default, so scores stay comparable.
const OPENROUTER_AFTER_FAILURES = 2;
const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      maxRetries: 0,
      timeout: 120_000,
      defaultHeaders: { 'HTTP-Referer': process.env.FRONTEND_URL || 'https://resumint-two.vercel.app', 'X-Title': 'Resumint' },
    })
  : null;
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b';
export const openRouterEnabled = Boolean(openrouter);

/** Same request on OpenRouter. Groq's flat reasoning_effort becomes OpenRouter's reasoning object. */
async function viaOpenRouter(params: CreateParams, groqError: unknown) {
  const { reasoning_effort, ...rest } = params as CreateParams & { reasoning_effort?: string };
  try {
    return await openrouter!.chat.completions.create({
      ...rest,
      model: OPENROUTER_MODEL,
      // OpenRouter picks a host per request; the default choice took ~49 s for one scan. Prefer the
      // fastest hosts (throughput), so a fallback scan takes seconds like it does on Groq.
      ...({ provider: { sort: 'throughput' } } as object),
      ...(reasoning_effort ? ({ reasoning: { effort: reasoning_effort } } as object) : {}),
    } as CreateParams);
  } catch (e) {
    console.error(`  ✖ OpenRouter fallback failed too (${(e as any)?.status ?? ''}): ${String((e as any)?.message).slice(0, 120)}`);
    // Report Groq's error when it was a rate limit: callers wait and retry on those.
    throw (groqError as any)?.status === 429 ? groqError : e;
  }
}

let next = 0;
// A rate-limited key is skipped until this time instead of being hit again.
const coolingUntil = new Array<number>(clients.length).fill(0);

const isRateLimit = (e: any) => e?.status === 429;
// Bad, revoked or restricted keys (Groq answers a restricted organization with a 400).
const isKeyProblem = (e: any) =>
  e?.status === 401 || e?.status === 403 || (e?.status === 400 && /organization has been restricted|invalid api key/i.test(String(e?.message)));

/**
 * How long Groq asked us to wait: "try again in 11.93s" (per-minute limit) or "in 11m30.7s" /
 * "in 1h2m3s" (daily limit). Defaults to 20s.
 */
export function coolDownMs(e: any) {
  const m = String(e?.message ?? '').match(/try again in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i);
  if (!m || !m[1]) return 20000;
  const part = (unit: string) => Number(m[1].match(new RegExp(`([\\d.]+)${unit}`))?.[1] ?? 0);
  const ms = (part('h') * 3600 + part('m') * 60 + part('s')) * 1000;
  return ms > 0 ? Math.ceil(ms) : 20000;
}


/**
 * Round-robin over the keys: every request starts on the next key. If a key is rate-limited
 * (or rejected), the same request moves straight on to the following key. After two Groq
 * failures on one request, it goes to OpenRouter when OPENROUTER_API_KEY is set.
 */
async function create(params: CreateParams): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  if (!clients.length) {
    if (openrouter) return viaOpenRouter(params, new Error('No Groq API key configured'));
    throw new Error('No Groq API key configured');
  }
  const start = next;
  next = (next + 1) % clients.length;

  let lastError: unknown;
  // A rate limit is worth retrying; a dead key is not. Report the retryable one if there was one.
  let rateLimitError: unknown;
  // Prefer keys that aren't cooling down; if all are, still try them in order (Groq may have recovered).
  const order = clients.map((_, i) => (start + i) % clients.length);
  // Every key hit its per-minute limit: wait for the first one to recover (a daily limit isn't waited out).
  const soonest = Math.min(...coolingUntil) - Date.now();
  if (soonest > 0 && openrouter) {
    // Waiting would burn the request's time budget; OpenRouter can answer now.
    console.warn(`  ↪ all Groq keys cooling down, using OpenRouter`);
    return viaOpenRouter(params, new Error('All Groq keys are cooling down'));
  }
  if (soonest > 0 && soonest <= 60_000) {
    console.warn(`  ⏳ all Groq keys at their per-minute limit, waiting ${Math.ceil(soonest / 1000)}s`);
    await new Promise((r) => setTimeout(r, soonest + 250));
  }
  const ready = order.filter((i) => coolingUntil[i] <= Date.now());
  let failures = 0;
  for (const i of [...ready, ...order.filter((i) => !ready.includes(i))]) {
    if (openrouter && failures >= OPENROUTER_AFTER_FAILURES) break;
    try {
      return await clients[i].chat.completions.create(params);
    } catch (e) {
      lastError = e;
      failures++;
      if (isRateLimit(e)) {
        coolingUntil[i] = Date.now() + coolDownMs(e);
        rateLimitError = e;
        console.warn(`  ⇄ Groq key #${i + 1} rate-limited, switching key`);
        continue;
      }
      if (isKeyProblem(e)) {
        coolingUntil[i] = Date.now() + 60 * 60 * 1000; // re-checked hourly in case it is reinstated
        console.error(`  ✖ Groq key #${i + 1} was rejected (${(e as any)?.status}); check it in backend/.env`);
        continue;
      }
      // Any other error (provider outage, a model output Groq refused such as invalid JSON):
      // another Groq key won't help, OpenRouter might.
      if (openrouter) {
        console.warn(`  ↪ Groq error ${(e as any)?.status ?? ''} on key #${i + 1}, using OpenRouter`);
        return viaOpenRouter(params, e);
      }
      throw e;
    }
  }
  if (openrouter && failures > 0) {
    console.warn(`  ↪ Groq failed ${failures} times on this request, using OpenRouter`);
    return viaOpenRouter(params, rateLimitError ?? lastError);
  }
  throw rateLimitError ?? lastError;
}

/** Drop-in for the OpenAI client surface this app uses: groq.chat.completions.create(...). */
export const groq = { chat: { completions: { create } } };

export const groqKeyCount = clients.length;
