import { readFileSync } from 'node:fs'
import { expect, test } from 'claude-code/testing'

import {
  finishedRuns, parseBlockers, parseWindows, usageJson, parseGov, parseConfig, parseEvents, panel, statusLine, laneStep, eta, quietArgv,
} from './lanes'
import type { PanelIn, Pr } from './lanes'

const L = (...n: string[]) => n.map(name => ({ name }))
const NOW = Date.parse('2026-11-26T13:00:00Z')   // 15:00 Israel
const minAgo = (m: number) => new Date(NOW - m * 60e3).toISOString()
const base = (over: Partial<PanelIn> = {}): PanelIn => ({
  now: NOW, open: [], closed: [], prs: [], wins: [], cloud: [], events: [], where: {}, gov: null, limits: [], questions: 0,
  cfg: { local: 0, remote: 6, express: 2, maxCore: 3, goal: 99 }, ...over,
})
const pr = (number: number, n: number, over: Partial<Pr> = {}): Pr => ({ number, headRefName: `lane/${n}`, createdAt: minAgo(10), mergeable: 'MERGEABLE', ...over })

test('blocked-by parsing', () => {
  expect(parseBlockers('Blocked by: #7, #9\ntext')).toEqual([7, 9])
  expect(parseBlockers('**Blocked by:** #3')).toEqual([3])
  expect(parseBlockers('see #4 only')).toEqual([])
  expect(parseBlockers('> * Blocked by: #5, #6')).toEqual([5, 6])
  expect(parseBlockers(null)).toEqual([])
})

test('windows and finished runs', () => {
  const wins = parseWindows(JSON.stringify({ terminals: [
    { address: 't1', state: 'live', where: 'Oren / issue-12' },
    { address: 't2', name: 'run-5', state: 'finished' },
    { address: 't3', state: 'live', where: 'x / 1' },
  ] }))
  expect(wins.map(w => w.name)).toEqual(['issue-12', 'run-5'])
  expect(finishedRuns(['run-5', 'run-6', 'issue-12'], wins)).toEqual(['run-5', 'run-6'])
})

test('usage.json for the governor (#239), governor and config parsing', () => {
  const u = usageJson([{ kind: 'five_hour', percentUsed: 23.4, resetsAt: '2026-11-25T19:00:00Z' }, { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-11-27T07:00:00Z' }], Date.parse('2026-11-25T15:00:00Z'))
  expect(u).toEqual({ five_h_pct: 23.4, five_h_reset: '2026-11-25T19:00:00Z', week_pct: 41, week_reset: '2026-11-27T07:00:00Z', at: '2026-11-25T15:00:00.000Z' })
  expect(usageJson([], 0)).toBe(null)
  expect(parseGov('{"lanes": 4, "stop": false, "projected": 90}')!.lanes).toBe(4)
  expect(parseGov('junk')).toBe(null)
  expect(parseConfig('local_lanes = 0\nremote_lanes = 6\nexpress_lanes = 2\nmax_core = 3\ngovernor_target = 99')).toEqual({ local: 0, remote: 6, express: 2, maxCore: 3, goal: 99 })
  expect(parseConfig('')).toEqual({ local: 3, remote: 0, express: 0, maxCore: 1, goal: 99 })
  expect(parseEvents('{"ts": 2, "issue": 1, "event": "b"}\ngarbage\n{"ts": 1, "issue": 1, "event": "a"}').map(e => e.event)).toEqual(['a', 'b'])
})

test('#296 one lane list: an issue with a PR is a lane, never in UP NEXT; no issue in two sections', () => {
  const p = panel(base({
    open: [
      { number: 269, title: 'Governor stop', labels: L('ready-for-agent', 'core', 'in-progress', 'P1') },
      { number: 274, title: 'Cloud thing', labels: L('ready-for-agent', 'core', 'in-progress', 'P0', 'express') },
      { number: 280, title: 'Has a PR, label gone', labels: L('ready-for-agent', 'pack', 'P1') },
      { number: 281, title: 'Next one', labels: L('ready-for-agent', 'pack', 'P1') },
      { number: 10, title: 'voice', labels: L('ready-for-human') },
    ],
    closed: [{ number: 263, title: 'Done thing', closedAt: minAgo(20) }],
    prs: [pr(270, 269), pr(300, 280)],
    cloud: [{ n: 274, title: 'Cloud thing', state: 'working', last: minAgo(5), stale: false, pr: '', session: '' },
      { n: 219, title: 'finished', state: 'done', last: minAgo(5), stale: false, pr: '', session: '' }],
    where: { 269: 'remote' },
  }))
  expect(p.issues.lanes).toEqual([269, 274, 280])
  expect(p.issues.next).toEqual([281])
  expect(p.issues.done).toEqual([263])
  expect(p.issues.you).toEqual([10])
  const all = [...p.issues.lanes, ...p.issues.next, ...p.issues.done, ...p.issues.you]
  expect(new Set(all).size).toBe(all.length)
  expect(p.lanes.filter(r => r.text.includes('#269')).length).toBe(1)
  expect(p.lanes.find(r => r.text.includes('#269'))!.text).toMatch(/^☁ #269 Governor stop — waiting review · PR #270 · \d\d:\d\d$/)
  expect(p.lanes.find(r => r.text.includes('#274'))!.text).toMatch(/^⚡ #274 /)
  expect(p.lanes.some(r => r.text.includes('#219'))).toBe(false)   // finished sessions never listed
  expect(p.lanesHead).toBe('LANES 3/8')
})

test('#296 step mapping', () => {
  const i = (n: number, ...l: string[]) => ({ number: n, title: 't', labels: L('in-progress', ...l) })
  const step = (iss: ReturnType<typeof i>, over: Partial<PanelIn>, p?: Pr, coreBusy = false) => laneStep(iss, base(over), p, coreBusy).step
  expect(step(i(1), {})).toBe('building')
  expect(step(i(1), {}, pr(5, 1))).toBe('waiting review')
  expect(step(i(1), { wins: [{ name: 'review-1', state: 'live/working' }] }, pr(5, 1))).toBe('in review')
  expect(step(i(1), { wins: [{ name: 'issue-1-fix', state: 'live/working' }] }, pr(5, 1))).toBe('fixing')
  expect(step(i(1), {}, pr(5, 1, { statusCheckRollup: [{ conclusion: 'FAILURE' }] }))).toBe('fixing')
  expect(step(i(1), {}, pr(5, 1, { mergeable: 'CONFLICTING' }))).toBe('resolving conflict')
  expect(step(i(1), {}, pr(5, 1, { autoMergeRequest: { enabledAt: 'x' } }))).toBe('merging')
  expect(step(i(1), { events: [{ ts: NOW / 1000, issue: 1, event: 'review_pass' }] }, pr(5, 1))).toBe('merging')
  expect(step(i(1, 'core'), {}, undefined, true)).toBe('waiting core slot')
  expect(step(i(1, 'blocked'), {})).toBe('blocked: see issue')
  expect(step(i(1), { cloud: [{ n: 1, title: 't', state: 'stuck', line: 'RESULT: STUCK tests red on main', last: minAgo(1), stale: false, pr: '', session: '' }] })).toBe('blocked: tests red on main')
  expect(step(i(1), { cloud: [{ n: 1, title: 't', state: 'question', last: minAgo(1), stale: false, pr: '', session: '' }] })).toBe('blocked: question for you')
  expect(step(i(1), { wins: [{ name: 'issue-1', state: 'live/blocked' }] })).toBe('blocked: window waits for input')
})

test('#296 amber after 30 min in a step, red when blocked; red sorts first', () => {
  const p = panel(base({
    open: [
      { number: 1, title: 'fresh', labels: L('in-progress') },
      { number: 2, title: 'old', labels: L('in-progress') },
      { number: 3, title: 'stuck', labels: L('in-progress', 'blocked') },
    ],
    events: [{ ts: (NOW - 10 * 60e3) / 1000, issue: 1, event: 'start' }, { ts: (NOW - 31 * 60e3) / 1000, issue: 2, event: 'start' }, { ts: (NOW - 1 * 60e3) / 1000, issue: 3, event: 'blocked' }],
  }))
  expect(p.lanes.map(r => [r.text.split(' ')[1], r.tone])).toEqual([['#3', 'red'], ['#2', 'amber'], ['#1', '']])
  const prs = (m: number) => panel(base({ prs: [pr(9, 99, { createdAt: minAgo(m) })] })).prs
  expect(prs(29).tone).toBe('')
  expect(prs(31).tone).toBe('amber')
  expect(prs(31).text).toBe('PRs 1 open · 1 need review · oldest #9 31m')
})

test('#296 NEEDS YOU hidden when nothing waits on the owner; shown red with questions', () => {
  expect(panel(base()).needsYou).toBe(null)
  const p = panel(base({ questions: 2, questionIssue: 205, open: [{ number: 10, title: 'v', labels: L('ready-for-human') }] }))
  expect(p.needsYou).toEqual({ text: 'NEEDS YOU: 2 questions (#205) · #10', tone: 'red' })
  expect(panel(base({ pc: { text: 'PC: CPU 91% · RAM 12% free', alarm: true } })).pc!.tone).toBe('red')
  expect(panel(base()).pc).toBe(null)
})

test('#296 header: P counts, 5h projected vs goal, week vs even pace; starts line', () => {
  const p = panel(base({
    open: [{ number: 1, title: 'a', labels: L('P0', 'ready-for-agent') }, { number: 2, title: 'b', labels: L('P1') }],
    closed: [{ number: 3, title: 'c', closedAt: minAgo(60 * 5) }, { number: 4, title: 'd', closedAt: minAgo(60 * 30) }],
    gov: { lanes: 4, stop: false, pct: 15, projected: 89.9, reset: (NOW + 4 * 3600e3) / 1000 },
    limits: [{ kind: 'five_hour', percentUsed: 15 }, { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(NOW + 3.5 * 86400e3).toISOString() }],
  }))
  expect(p.header[0]!.text).toBe('P0 1 · P1 1 · done 1/24h')
  expect(p.header[1]!.text).toBe('5h 15% → ~90% at 19:00 (goal 99) · week 41% (even 50%)')
  expect(p.header[1]!.tone).toBe('dim')
  expect(p.lanesHead).toBe('LANES 0/6')
  expect(p.starts.text).toBe('next start: #1')
  expect(p.doneHead).toBe('DONE last hour: 0')
  const stop = panel(base({ gov: { stop: true, pct: 99, reset: (NOW + 3600e3) / 1000 } }))
  expect(stop.starts).toEqual({ text: 'new starts STOPPED: 5h at 99%', tone: 'red' })
  expect(statusLine(p)).toBe('lanes 0/6 · PRs need review 0 · 5h 15% → ~90% · week 41% (even 50%)')
})

test('#296 forecast from the net close rate', () => {
  const h = 3600e3
  expect(eta(3, [NOW - h, NOW - 2 * h, NOW - 3 * h], [], NOW)).toBe(NOW + 6 * h)   // 3 closed in 6 h = 0.5/h
  expect(eta(3, [], [NOW - h], NOW)).toBe(null)
  expect(panel(base()).forecast.text).toBe('Forecast: no open P0 · nothing open')
})

test('#296 usage line says (stale) when governor.json is older than 15 min', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 15, resetsAt: new Date(NOW + 3600e3).toISOString() }] as any
  const at = (m: number) => (NOW - m * 60e3) / 1000
  expect(panel(base({ limits: lim, gov: { at: at(5) } })).header[1]!.text).not.toMatch('(stale)')
  expect(panel(base({ limits: lim, gov: { at: at(16) } })).header[1]!.text).toMatch('(stale)')
})

test('#245 usage line shows efficiency (merged PRs per 10% of 5h) and wasted runs from governor.json', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 15, resetsAt: new Date(NOW + 3600e3).toISOString() }] as any
  const at = NOW / 1000
  expect(panel(base({ limits: lim, gov: { at, eff: 0.75, wasted: 2 } })).header[1]!.text).toMatch(/ · eff 0\.75\/10% · wasted 2$/)
  expect(panel(base({ limits: lim, gov: { at, eff: null, wasted: 0 } })).header[1]!.text).toMatch(/ · eff - · wasted 0$/)
  expect(panel(base({ limits: lim, gov: { at } })).header[1]!.text).not.toMatch('eff')
})

test('#305 every process call goes through pythonw + quiet.py', () => {
  expect(quietArgv(['gh', 'x']).slice(0, 2).map(a => a.replace(/^.*[/]/, ''))).toEqual(['pythonw.exe', 'quiet.py'])
  const src = readFileSync(new URL('./register.tsx', import.meta.url), 'utf8')
  const direct = src.split(String.fromCharCode(10)).filter(l => /\$\.process\.(run|spawn|exec)\(/.test(l) && !l.includes('quietArgv('))
  expect(direct).toEqual([])
})

test('#297 cloud row waiting review shows the PR number even without a PR in the list; #263 manual', () => {
  const cl = (over: object) => ({ n: 269, title: 'Quiet', state: 'waiting review', last: minAgo(5), stale: false, pr: 'https://github.com/x/y/pull/270', session: '', ...over })
  const open = [{ number: 269, title: 'Quiet', labels: L('in-progress', 'cloud') }]
  const t1 = panel(base({ open, prs: [], cloud: [cl({})] })).lanes[0]!.text
  expect(t1).toMatch(/^.{1,3}#269 Quiet . waiting review . PR #270 . \d\d:\d\d$/)
  expect(panel(base({ open, prs: [], cloud: [cl({ manual: true })] })).lanes[0]!.text).toMatch(/PR #270 . manual . \d\d:\d\d$/)
})

test('#306 the panel shows the cloud desks line (.runs/desks.json text), red when a desk is down', () => {
  expect(panel(base()).desks).toBe(null)
  expect(panel(base({ desks: 'cloud desks: inbox ok · ask ok' })).desks).toEqual({ text: 'cloud desks: inbox ok · ask ok', tone: 'dim' })
  expect(panel(base({ desks: 'cloud desks: inbox ok · ask down' })).desks!.tone).toBe('red')
})
