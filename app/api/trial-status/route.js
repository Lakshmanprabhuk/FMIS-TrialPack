import { NextResponse } from 'next/server';
import { supabaseAdmin, getUserFromRequest } from '../../../lib/supabaseAdmin';
import { evaluateTrial } from '../../../lib/trial';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('name, org_name, last_trial_at, trial_count')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const { eligible, nextAvailableAt } = evaluateTrial(profile);

  return NextResponse.json({
    eligible,
    nextAvailableAt,
    name: profile.name,
    orgName: profile.org_name,
    trialCount: profile.trial_count,
  });
}
