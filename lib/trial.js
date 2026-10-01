const COOLDOWN_DAYS = Number(process.env.TRIAL_COOLDOWN_DAYS || 7);

export function evaluateTrial(profile) {
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  if (!profile?.last_trial_at) {
    return { eligible: true, nextAvailableAt: null };
  }
  const last = new Date(profile.last_trial_at).getTime();
  const nextAvailableAt = new Date(last + cooldownMs);
  const eligible = Date.now() >= nextAvailableAt.getTime();
  return { eligible, nextAvailableAt: eligible ? null : nextAvailableAt.toISOString() };
}
