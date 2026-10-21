import { computeInsights, groupTotals, metricInfo, metricLabel, dimTitle, dimCandidates } from './engine';
import { restrict } from './deep';
import { fmtMetric, fmtPct, fmtSigned, fmtInt, fmtPeriod } from './format';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds category values named in the user's focus text, e.g. "why did Visser decline?".
export function findFocusMatches(ds, text) {
  const t = String(text || '').toLowerCase();
  if (t.trim().length < 3) return [];
  const out = [];
  for (const col of ds.cats) {
    const dict = ds.cols[col].dict;
    if (dict.length > 3000) continue;
    for (const v of dict) {
      if (v.length < 3) continue;
      const re = new RegExp('(^|[^\\p{L}\\p{N}])' + esc(v.toLowerCase()) + '([^\\p{L}\\p{N}]|$)', 'u');
      if (re.test(t)) out.push({ col, value: v });
    }
  }
  return out.sort((a, b) => b.value.length - a.value.length).slice(0, 3);
}

// Extra measured facts for the user's focus. Everything is computed here; the model only words it.
export function focusFacts(ds, mask, o, ins, text) {
  const items = [];
  const matches = findFocusMatches(ds, text);
  const info = metricInfo(ds, o.metric);
  const money = (v) => fmtMetric(v, info);
  const ml = o.metric === '__count' ? 'record count' : metricLabel(o.metric);
  const g = o.gran;
  const add = (id, t) => t && items.push({ id, text: String(t).slice(0, 280) });

  if (!matches.length) {
    add('focus_none', 'No specific value from the file\'s category columns was named in the focus, so the answer relies on the general facts.');
    return { matches, items };
  }

  matches.forEach((m, k) => {
    const rm = restrict(ds, mask, m.col, m.value);
    const subDim = dimCandidates(ds).find((d) => d !== m.col) || null;
    const sub = computeInsights(ds, rm, { ...o, dimKey: subDim });
    const tot = sub.tot;
    const label = `${m.value} (${m.col})`;
    const all = groupTotals(ds, mask, m.col, o.metric);
    const rank = all.findIndex((x) => x.label === m.value) + 1;
    const grand = all.reduce((a, x) => a + Math.max(0, x.value), 0);
    const mine = all.find((x) => x.label === m.value);
    if (mine) {
      add(`focus_${k}_total`, `${label}: ${money(mine.value)} of ${ml} over ${fmtInt(tot.count)} records, ${fmtPct(grand ? mine.value / grand : 0)} of the total; rank ${rank} of ${all.length}.`);
      const avg = all.length ? grand / all.length : 0;
      if (avg) add(`focus_${k}_peers`, `Average ${m.col} value is ${money(avg)}; ${m.value} is ${fmtSigned((mine.value - avg) / Math.abs(avg))} versus that average.`);
    }
    const s = sub.series;
    if (s) {
      const vals = s.values.slice(0, s.endIdx + 1);
      const labs = s.labels.slice(0, s.endIdx + 1);
      if (vals.length >= 2) {
        const last = vals[vals.length - 1], prev = vals[vals.length - 2];
        if (prev) add(`focus_${k}_trend`, `${m.value}: ${fmtPeriod(labs[labs.length - 1])} was ${money(last)} versus ${money(prev)} in ${fmtPeriod(labs[labs.length - 2])} (${fmtSigned((last - prev) / Math.abs(prev))}).`);
        let streak = 0;
        for (let i = vals.length - 1; i > 0 && vals[i] < vals[i - 1]; i--) streak++;
        if (streak >= 2) add(`focus_${k}_streak`, `${m.value} has declined for ${streak} consecutive ${g}s, from ${money(vals[vals.length - 1 - streak])} to ${money(vals[vals.length - 1])}.`);
        const hi = vals.indexOf(Math.max(...vals)), lo = vals.indexOf(Math.min(...vals));
        add(`focus_${k}_range`, `${m.value}: peak ${fmtPeriod(labs[hi])} at ${money(vals[hi])}; lowest ${fmtPeriod(labs[lo])} at ${money(vals[lo])}.`);
      }
    }
    if (sub.groups.length) {
      const tg = sub.groups.reduce((a, x) => a + Math.max(0, x.value), 0);
      const dn = subDim ? dimTitle(ds, subDim) : '';
      const top = sub.groups.slice(0, 3).map((x) => `${x.label} ${fmtPct(tg ? x.value / tg : 0)}`).join(', ');
      if (top && dn) add(`focus_${k}_mix`, `Within ${m.value}, the biggest ${dn} values are ${top}.`);
    }
    if (sub.declines.length) {
      const d = sub.declines[0];
      add(`focus_${k}_decl`, `Inside ${m.value}, ${d.label} declined for ${d.streak} consecutive periods (${fmtSigned(d.change)}).`);
    }
  });
  return { matches, items };
}
