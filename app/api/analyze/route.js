import { NextResponse } from 'next/server';
import { supabaseAdmin, getUserFromRequest } from '../../../lib/supabaseAdmin';
import { evaluateTrial } from '../../../lib/trial';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { prompt } = await request.json();
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 });
  }

  // Re-check eligibility server-side right before spending the trial —
  // never trust a client-side check alone.
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
    return NextResponse.json(
      { error: 'Weekly trial already used.', nextAvailableAt },
      { status: 429 }
    );
  }

  // Call Gemini with the key held only on the server.
  let text;
  try {
    text = await callGemini(prompt);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  // Consume the trial only after a successful generation, using the
  // service-role client so the write bypasses RLS and can't be spoofed.
  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({
      last_trial_at: new Date().toISOString(),
      trial_count: (profile.trial_count || 0) + 1,
    })
    .eq('id', user.id);

  if (updateErr) {
    // The generation succeeded but we failed to record trial usage — log it,
    // still return the result to the user rather than losing their work.
    console.error('Failed to update trial usage for user', user.id, updateErr);
  }

  return NextResponse.json({ text });
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Server is not configured with a Gemini API key.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
    }),
  });

  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`Gemini error ${r.status}: ${e?.error?.message || r.statusText}`);
  }

  const body = await r.json();
  const t = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!t) throw new Error('Empty response from Gemini.');
  return t;
}
