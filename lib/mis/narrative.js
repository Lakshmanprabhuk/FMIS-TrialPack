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

// Never throws. Any text containing a figure absent from the computed facts is dropped.
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
    const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

    const out = { title: str(raw.title, 90), summary: str(raw.summary, 420), takeaways: [], sections: {}, risks: {}, opportunities: [], reasons: {}, ideas: [], possibilities: [], questions: [] };

    list(raw.takeaways, 6).forEach((t) => {
      const text = str(typeof t === 'string' ? t : t?.text, 300);
      if (text) out.takeaways.push({ text, ref: t && ids.has(t.ref) ? t.ref : null });
    });
    ['summary', 'insights', 'trends', 'forecast', 'compare', 'breakdown', 'ranking', 'exceptions', 'ideas', 'quality'].forEach((k) => {
      const s = str(raw.sections?.[k], 420);
      if (s) out.sections[k] = s;
    });
    list(raw.risks, 10).forEach((r) => {
      const c = str(r?.comment, 260);
      if (c && ids.has(r?.ref)) out.risks[r.ref] = c;
    });
    list(raw.opportunities, 4).forEach((r) => {
      const c = str(r?.comment, 260);
      if (c && ids.has(r?.ref)) out.opportunities.push({ ref: r.ref, text: c });
    });
    list(raw.reasons, 8).forEach((r) => {
      const c = str(r?.text, 300);
      if (c && ids.has(r?.ref) && !out.reasons[r.ref]) out.reasons[r.ref] = c;
    });
    list(raw.ideas, 8).forEach((r) => {
      const c = str(r?.text, 300);
      if (c && ids.has(r?.ref)) out.ideas.push({ ref: r.ref, text: c, effort: ['low', 'medium', 'high'].includes(r.effort) ? r.effort : '' });
    });
    list(raw.possibilities, 6).forEach((r) => {
      const c = str(r?.text, 300);
      if (c && ids.has(r?.ref)) out.possibilities.push({ ref: r.ref, text: c });
    });
    list(raw.questions, 7).forEach((r) => {
      const c = str(r?.text, 260);
      if (c && ids.has(r?.ref)) out.questions.push({ ref: r.ref, text: c });
    });
    return out;
  } catch {
    return null;
  }
}
