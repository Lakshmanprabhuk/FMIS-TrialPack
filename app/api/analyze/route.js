import { NextResponse } from 'next/server';
import { supabaseAdmin, getUserFromRequest } from '../../../lib/supabaseAdmin';
import { evaluateTrial } from '../../../lib/trial';
import { buildNarrativePrompt, validateNarrativeInput } from '../../../lib/narrativePrompt';

export const maxDuration = 60;

// Models are tried in this order. When one is overloaded (503), rate limited (429), slow, or unknown (404),
// the next one answers. Override with GEMINI_MODELS="a,b,c" (comma separated, primary first).
const DEFAULT_CHAIN = [
  'gemini-flash-lite-latest', // primary
  'gemini-3-flash-preview', // secondary
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-pro-latest',
];
function modelChain() {
  const custom = (process.env.GEMINI_MODELS || '').split(',').map((x) => x.trim()).filter(Boolean);
  return [...new Set(custom.length ? custom : DEFAULT_CHAIN)];
}
// A model that just failed is skipped for a while so the next request does not wait on it again.
const cooldown = new Map();
const COOL_MS = { 503: 60000, 429: 90000, 500: 30000, 504: 30000, 404: 600000, 400: 300000 };

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // The client sends only computed facts. The prompt is built here, so the
  // endpoint cannot be used as a general-purpose text generator.
  const input = validateNarrativeInput(body);
  if (!input) {
    return NextResponse.json({ error: 'Missing or invalid report summary.' }, { status: 400 });
  }

  // Re-check eligibility server-side right before spending the trial.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('last_trial_at, trial_count')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const { eligible, nextAvailableAt } = evaluateTrial(profile);
  if (!eligible) {
    return NextResponse.json({ error: 'Weekly trial already used.', nextAvailableAt }, { status: 429 });
  }

  let narrative;
  try {
    narrative = await generateNarrative(buildNarrativePrompt(input.facts, input.meta));
  } catch (e) {
    // Real error is logged, never exposed. The trial is NOT consumed on failure.
    console.error('Narrative provider error:', e);
    return NextResponse.json(
      { error: 'Commentary could not be generated. Your report is still available.' },
      { status: 502 }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({
      last_trial_at: new Date().toISOString(),
      trial_count: (profile.trial_count || 0) + 1,
    })
    .eq('id', user.id);

  if (updateErr) {
    console.error('Failed to update trial usage for user', user.id, updateErr);
  }

  return NextResponse.json({ narrative });
}

// ── helpers ────────────────────────────────────────────────────────────────
function extractJson(raw) {
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

async function generateNarrative(prompt) {
  const chain = modelChain();
  const t0 = Date.now();
  const BUDGET = 55000; // stays inside maxDuration (60 s)
  const ready = chain.filter((m) => (cooldown.get(m) || 0) <= Date.now());
  const order = ready.length ? ready : chain;
  let lastErr = new Error('No attempt made.');
  let strict = false;
  for (const model of order) {
    const left = BUDGET - (Date.now() - t0);
    if (left < 4000) break;
    try {
      const text = await callGemini(
        strict ? prompt + '\n\nYour previous reply could not be parsed. Reply again with ONLY the JSON object.' : prompt,
        model,
        Math.min(25000, left)
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
      if (e.status === 401 || e.status === 403) break; // a bad key cannot be fixed by another model
      const ms = COOL_MS[e.status] || (e.name === 'TimeoutError' ? 30000 : 0);
      if (ms) cooldown.set(model, Date.now() + ms);
    }
  }
  throw lastErr;
}

async function callGemini(prompt, model, timeoutMs = 25000) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Server is not configured with an API key.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
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
