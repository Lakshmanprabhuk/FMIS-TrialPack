import { createClient } from '@supabase/supabase-js';

// SERVER-SIDE ONLY. Never import this file from a client component —
// SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix so Next.js will
// refuse to bundle it into browser code, but keep this import server-only
// as a second layer of safety.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Verifies the bearer token sent by the browser and returns the user,
// or null if the token is missing/invalid.
export async function getUserFromRequest(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
