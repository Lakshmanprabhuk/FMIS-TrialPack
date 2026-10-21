const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
// Models tried in order when the main one is overloaded (503/429), missing (404) or failing. Fast, text-capable
// models first, slower "pro" models last. Override with GEMINI_MODELS="a,b,c" (comma separated, main model first).
const DEFAULT_CHAIN = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-pro-latest',
];
export function modelChain() {
  const custom = (process.env.GEMINI_MODELS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const list = custom.length ? custom : [GEMINI_MODEL, ...DEFAULT_CHAIN];
  return [...new Set(list)];
}
// A model that just failed is skipped for a while, so the next request does not wait on it again.
const cooldown = new Map();
const COOL_MS = { 503: 60000, 429: 90000, 500: 30000, 504: 30000, 404: 600000, 400: 300000 };
const now = () => Date.now();

export function extractJson(raw) {
  let c = String(raw || '').trim();
  const fence = c.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) c = fence[1].trim();
  const a = c.indexOf('{');
  const b = c.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const slice = c.slice(a, b + 1);
  for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const o = JSON.parse(candidate);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function callGemini(prompt, { maxOutputTokens = 8192, model = GEMINI_MODEL, timeoutMs = 50000 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Server is not configured with an API key.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const err = new Error(`Provider error ${r.status}: ${e?.error?.message || r.statusText}`);
    err.status = r.status;
    throw err;
  }

  const body = await r.json();
  const parts = body.candidates?.[0]?.content?.parts || [];
  const t = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  if (!t) throw new Error('Empty response.');
  return t;
}

// Asks for one JSON object. Walks the model chain: on overload, rate limit, timeout, unknown model or a model
// that rejects the request, it moves straight on to the next model. A bad key (401/403) stops at once, since no
// other model can help. An unparseable reply is retried on the next model with a stricter instruction.
// The whole call stays inside ~55 s so it fits the route's 60 s limit.
export async function generateJson(prompt, opts = {}) {
  const chain = modelChain();
  const t0 = now();
  const BUDGET = 55000;
  const ready = chain.filter((m) => (cooldown.get(m) || 0) <= now());
  const order = ready.length ? ready : chain; // everything cooling down: try anyway
  let lastErr = new Error('No attempt made.');
  let strict = false;
  for (const model of order) {
    const left = BUDGET - (now() - t0);
    if (left < 4000) break;
    try {
      const text = await callGemini(
        strict ? prompt + '\n\nYour previous reply could not be parsed. Reply again with ONLY the JSON object.' : prompt,
        { ...opts, model, timeoutMs: Math.min(25000, left) }
      );
      const obj = extractJson(text);
      if (obj) {
        if (model !== chain[0]) console.info(`Gemini: answered by fallback model ${model}`);
        return obj;
      }
      lastErr = new Error('Unparseable model output.');
      strict = true;
    } catch (e) {
      lastErr = e;
      console.warn(`Gemini: ${model} failed (${e.status || e.name}): ${String(e.message).slice(0, 120)}`);
      if (e.status === 401 || e.status === 403) break;
      const ms = COOL_MS[e.status] || (e.name === 'TimeoutError' ? 30000 : 0);
      if (ms) cooldown.set(model, now() + ms);
    }
  }
  throw lastErr;
}
