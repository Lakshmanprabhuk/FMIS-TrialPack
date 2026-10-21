import { NextResponse } from 'next/server';
import { supabaseAdmin, getUserFromRequest } from '../../../lib/supabaseAdmin';
import { evaluateTrial } from '../../../lib/trial';
import { buildNarrativePrompt, validateNarrativeInput } from '../../../lib/narrativePrompt';
import { generateJson } from '../../../lib/gemini';

export const maxDuration = 60;

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
    narrative = await generateJson(buildNarrativePrompt(input.facts, input.meta, input.context));
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
