import { NextResponse } from 'next/server';
import { supabaseAdmin, getUserFromRequest } from '../../../lib/supabaseAdmin';
import { evaluateTrial } from '../../../lib/trial';
import { generateJson } from '../../../lib/gemini';
import { buildVerifyPrompt, sanitizeVerify, validateVerifyInput } from '../../../lib/verifyPrompt';

export const maxDuration = 60;

// "Do you understand my file?" check. It never consumes the weekly trial: only a completed analysis does.
// It does require a signed-in user whose trial is still available, so it cannot be used as a free text generator.
export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const input = validateVerifyInput(body);
  if (!input) return NextResponse.json({ error: 'Missing or invalid file profile.' }, { status: 400 });

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('last_trial_at, trial_count')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  const { eligible, nextAvailableAt } = evaluateTrial(profile);
  if (!eligible) return NextResponse.json({ error: 'Weekly trial already used.', nextAvailableAt }, { status: 429 });

  try {
    const raw = await generateJson(buildVerifyPrompt(input), { maxOutputTokens: 6000 });
    const verify = sanitizeVerify(raw, input.columns.map((c) => c.name));
    if (!verify) throw new Error('Invalid verification output.');
    return NextResponse.json({ verify });
  } catch (e) {
    console.error('Verify provider error:', e);
    return NextResponse.json({ error: 'The AI check could not be completed.' }, { status: 502 });
  }
}
