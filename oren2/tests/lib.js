// Shared helpers for the Oren game test suites.
// The page under test is oren2/index.html wrapped in a doctype (tests/.tmp/t.html), built by run.sh.
const path = require('path'), fs = require('fs');
// #284: every suite loads this file; Playwright never runs on the owner's PC, only in CI, a cloud session, or with ALLOW_LOCAL_TESTS=1
if (process.env.CI !== 'true' && process.env.ALLOW_LOCAL_TESTS !== '1' && process.env.CLAUDE_CODE_REMOTE !== 'true') {
  console.error("game suites run in CI only (#284): see the PR's 'tests' check (ALLOW_LOCAL_TESTS=1 to override)"); process.exit(3); }
require('./mute.js');                               // every test browser is silent
const ROOT = path.resolve(__dirname, '..');          // oren2/
const TMP = path.join(__dirname, '.tmp');
const PAGE = path.join(TMP, 't.html');
const SHOTDIR = path.join(TMP, 'shots');
const wrap = html => '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>';
if (!fs.existsSync(PAGE)) { fs.mkdirSync(TMP, { recursive: true }); fs.writeFileSync(PAGE, wrap(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// screenshots only when SHOTS=1 (they are slow and only useful for eyeballing)
function shot(page, opts) {
  if (!process.env.SHOTS) return Promise.resolve();
  fs.mkdirSync(SHOTDIR, { recursive: true });
  return page.screenshot(opts);
}
// print PASS/FAIL lines + a RESULT summary line, set exit code
function finish(name, lines) {
  const pass = lines.filter(l => /^PASS/.test(l)).length, fail = lines.filter(l => /^FAIL/.test(l)).length;
  lines.forEach(l => console.log(l));
  console.log(`RESULT ${name} ${pass} ${fail}`);
  if (fail || !pass) process.exitCode = 1;
}
const variant = process.argv[2] || 'desktop';
const VIEWPORT = variant === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } };
module.exports = { ROOT, TMP, PAGE, URL: 'file://' + PAGE, SHOTDIR, wrap, sleep, shot, finish, variant, VIEWPORT };
// the pointing guide (coach marks), the first-time home tour and the place intros can cover dialogs mid-test; switch them off once the page is up
module.exports.noCoach = async page => { await page.waitForFunction(() => window.TAL && window.TAL.S, null, { timeout: 15000 }); await page.evaluate(() => { window.TAL.S().coach = { home: 99, hub: 99, group: 99, map: 99, tour: 1, 'i-city': 1, 'i-map': 1, 'i-king': 1, 'i-arc': 1 }; }); };
// a lesson: answer the example (any answer; after two wrong ones the right one lights up), then "now it's your turn"
// (#267: a hands-on board is tapped first, one marked step at a time)
module.exports.doLesson = async page => { for (let k = 0; k < 40; k++) { if (await page.locator('#sLearn').isHidden()) return;
  const n = page.locator('#sLearn .mbh .nxt'); if (await n.count()) { await n.first().click(); await sleep(60); continue; }
  const b = page.locator('#sLearn .btnrow .bigbtn'); if (await b.count()) await b.click(); else await page.locator('#sLearn .lch .chb:not([disabled])').first().click(); await sleep(200); } };
