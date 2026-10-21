export async function fetchVerify(payload, token) {
  const r = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  let body = {};
  try {
    body = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const e = new Error(body.error || 'Request failed.');
    e.status = r.status;
    e.nextAvailableAt = body.nextAvailableAt;
    throw e;
  }
  return body.verify;
}
