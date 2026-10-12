const NUM_RE = /\d[\d,]*\.?\d*/g;
const normTok = (t) => {
  const n = parseFloat(t.replace(/,/g, ''));
  return isNaN(n) ? null : String(n);
};

export async function fetchNarrative(facts, meta, token) {
  const r = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ facts, meta }),
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
  return body.narrative;
}

// Defensive validation. Never throws. Returns null if unusable.
// Number guard: any text containing a figure that does not appear in the computed
// facts is dropped, so the language model can never introduce a number.
export function sanitizeNarrative(raw, facts) {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const ids = new Set(facts.map((f) => f.id));
    const allowed = new Set();
    facts.forEach((f) =>
      (f.text.match(NUM_RE) || []).forEach((t) => {
        const k = normTok(t);
        if (k != null) allowed.add(k);
      })
    );
    const numbersOk = (text) =>
      (text.match(NUM_RE) || []).every((t) => {
        const k = normTok(t);
        if (k == null || allowed.has(k)) return true;
        const n = Number(k);
        return Number.isInteger(n) && n >= 0 && n <= 10;
      });
    const str = (v, max) => {
      if (typeof v !== 'string') return '';
      const s = v.replace(/[*`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
      return s && numbersOk(s) ? s : '';
    };

    const out = { title: str(raw.title, 90), summary: str(raw.summary, 420), takeaways: [], sections: {}, risks: {}, opportunities: [] };

    (Array.isArray(raw.takeaways) ? raw.takeaways : []).slice(0, 6).forEach((t) => {
      const text = str(typeof t === 'string' ? t : t?.text, 300);
      if (text) out.takeaways.push({ text, ref: t && ids.has(t.ref) ? t.ref : null });
    });
    ['summary', 'trends', 'breakdown', 'ranking', 'exceptions', 'quality'].forEach((k) => {
      const s = str(raw.sections?.[k], 420);
      if (s) out.sections[k] = s;
    });
    (Array.isArray(raw.risks) ? raw.risks : []).slice(0, 10).forEach((r) => {
      const c = str(r?.comment, 260);
      if (c && ids.has(r?.ref)) out.risks[r.ref] = c;
    });
    (Array.isArray(raw.opportunities) ? raw.opportunities : []).slice(0, 4).forEach((r) => {
      const c = str(r?.comment, 260);
      if (c && ids.has(r?.ref)) out.opportunities.push({ ref: r.ref, text: c });
    });
    return out;
  } catch {
    return null;
  }
}
