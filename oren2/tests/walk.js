// #745: shared "walk every screen" helper. A rule that must hold on EVERY screen (voice, back/forward, help) is tested by walking all screens,
// not the few the worker looked at. The failure line lists every screen that breaks the rule.
// walkScreens(ids, open, rule): open(id) brings the screen up; rule(id) returns true (ok) or a string/false (broken, the string is the reason).
// Returns { total, broken: ['id' | 'id: reason', ...] }. A throw in open() or rule() counts as broken (never stops the walk).
async function walkScreens(ids, open, rule) {
  const broken = [];
  for (const id of ids) {
    try { await open(id); const r = await rule(id); if (r !== true) broken.push(r ? id + ': ' + r : id); }
    catch (e) { broken.push(id + ': ' + String(e && e.message || e).split('\n')[0]); }
  }
  return { total: ids.length, broken };
}
// one PASS/FAIL line for a suite's result list: 'rule: N of M screens break it: a, b, c'
function walkLine(rule, w) {
  const bad = w.broken.length;
  return (bad === 0 && w.total > 0 ? 'PASS ' : 'FAIL ') + rule + ' (' + w.total + ' screens)' + (bad ? ' — ' + bad + ' break it: ' + w.broken.join(', ') : w.total ? '' : ' — no screens walked');
}
module.exports = { walkScreens, walkLine };
