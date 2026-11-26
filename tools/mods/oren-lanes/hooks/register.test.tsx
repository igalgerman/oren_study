import { expect, test } from 'claude-code/testing'

import {
  finishedRuns, groupIssues, parseBlockers, parseWindows, statusLine,
} from './lanes'

test('blocked-by parsing', () => {
  expect(parseBlockers('Blocked by: #7, #9\ntext')).toEqual([7, 9])
  expect(parseBlockers('**Blocked by:** #3')).toEqual([3])
  expect(parseBlockers('see #4 only')).toEqual([])
  expect(parseBlockers('- Blocked by: #23')).toEqual([23])
  expect(parseBlockers('> * Blocked by: #5, #6')).toEqual([5, 6])
  expect(parseBlockers(null)).toEqual([])
})

test('grouping and counts', () => {
  const L = (...n: string[]) => n.map(name => ({ name }))
  const g = groupIssues([
    { number: 1, title: 'a', labels: L('in-progress') },
    { number: 2, title: 'b', labels: L('ready-for-agent') },
    { number: 3, title: 'c', labels: L('ready-for-agent'), body: 'Blocked by: #1' },
    { number: 4, title: 'd', labels: L('ready-for-agent'), body: 'Blocked by: #99' },
    { number: 5, title: 'e', labels: L('blocked') },
    { number: 6, title: 'f', labels: L('ready-for-human') },
    { number: 7, title: 'g', labels: L('needs-triage') },
  ])
  expect(g.running.count).toBe(1)
  expect(g.ready.titles).toEqual(['#2 b', '#4 d'])
  expect(g.waiting.titles).toEqual(['#3 c'])
  expect(g.blocked.count).toBe(1)
  expect(g.needsYou.count).toBe(1)
  expect(g.triage.count).toBe(1)
})

test('windows, finished runs and status line', () => {
  const wins = parseWindows(JSON.stringify({ terminals: [
    { address: 't1', state: 'live', where: 'Oren / issue-12' },
    { address: 't2', name: 'run-5', state: 'finished' },
    { address: 't3', state: 'live', where: 'x / 1' },
  ] }))
  expect(wins.map(w => w.name)).toEqual(['issue-12', 'run-5'])
  expect(finishedRuns(['run-5', 'run-6', 'issue-12'], wins)).toEqual(['run-5', 'run-6'])
  const groups = groupIssues([])
  const d = { windows: wins, groups, lastLog: '', errors: [], updatedAt: 0 }
  expect(statusLine(d)).toBe('lanes local 1/3 · cloud 0 · ready 0 · blocked 0')
  groups.needsYou.count = 2
  expect(statusLine(d)).toMatch(/^lanes local 1\/3 · cloud 0 · ready 0 · blocked 0/)
})

import { usageText } from './lanes'
test('usage text', () => {
  const t = usageText([{ kind: 'five_hour', percentUsed: 23.4, resetsAt: '2026-11-25T19:00:00Z' }, { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-11-27T07:00:00Z' }])
  expect(t).toMatch(/^5h 23% → \d\d:\d\d · week 41% → \w+ \d\d:\d\d$/)
  expect(usageText([])).toBe('')
})

import { flowRows } from './lanes'
test('flow rows', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const open = [
    { number: 3, title: 'B', labels: lab('core', 'ready-for-agent', 'in-progress') },
    { number: 4, title: 'C', labels: lab('core', 'ready-for-agent'), body: 'Blocked by: #3' },
    { number: 10, title: 'voice', labels: lab('ready-for-human') },
  ]
  const rows = flowRows(open, [{ number: 1, title: 'A' }], [{ name: 'review-3', state: 'live/working' }], ['lane/3'])
  expect(rows[0]).toMatch(/^#3 ✓Plan ✓Build ●Review ○Merge ○Live/)
  expect(rows[1]).toMatch(/waits for #3/)
  expect(rows[2]).toMatch(/your task/)
  expect(rows[3]).toMatch(/^#1 ✓Plan ✓Build ✓Review ✓Merge ✓Live/)
})

import { statsLines } from './lanes'
test('stats lines', () => {
  const ev = (ts: number, issue: number, event: string) => JSON.stringify({ ts, issue, lane: 'core', event })
  const text = [ev(1000, 1, 'start'), ev(1600, 1, 'worker_done'), ev(2500, 1, 'review_pass'), ev(3000, 1, 'merged'),
    ev(90000, 2, 'start'), ev(90300, 2, 'worker_done'), 'garbage'].join('\n')
  const l = statsLines(text, 91000)
  expect(l[0]).toBe('merged 0 in 24h · 1 total')
  expect(l[1]).toBe('avg to merge 33m')
  expect(l[2]).toBe('avg build 8m · review 15m')
  expect(l[3]).toBe('last #2: build 5m · review - · merge -')
  expect(statsLines('', 0)).toEqual([])
  // #114: last deploy line (Israel time)
  const d = (ts: number, ok: boolean, d1: boolean) => JSON.stringify({ ts, issue: 0, lane: '', event: 'deploy', ok, d1, url: 'https://x.oren-game.pages.dev' })
  expect(statsLines([text, d(1795671000, false, true), d(1795671559, true, false)].join('\n'), 91000)[4]).toBe('last deploy 07:39 ok · ⚠ no D1, saves on KV')
  expect(statsLines(d(1795671000, false, true), 0)).toEqual(['last deploy 07:30 FAILED'])
})

import { laneReasons } from './lanes'
test('lane reasons', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const r = laneReasons([
    { number: 4, title: 'C', labels: lab('core', 'ready-for-agent', 'in-progress') },
    { number: 5, title: 'G', labels: lab('core', 'ready-for-agent'), body: 'Blocked by: #4' },
    { number: 10, title: 'voice', labels: lab('ready-for-human') },
  ], [])
  expect(r.length).toBe(3)
  expect(r[0]).toMatch(/^1\. #4 running/)
  expect(r[1]).toMatch(/free — .*wait in the chain .*need you first: #10/)
})

import { view } from './lanes'
test('readable view', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 4, title: 'Batch C', labels: lab('core', 'ready-for-agent', 'in-progress') },
    { number: 5, title: 'G1-G8', labels: lab('core', 'ready-for-agent'), body: 'Blocked by: #4' },
    { number: 10, title: 'voice', labels: lab('ready-for-human') },
    { number: 11, title: 'math ideas', labels: lab('core', 'needs-triage') },
  ], [{ number: 3, title: 'Batch B' }], [{ name: 'review-4', state: 'live/working' }], ['lane/4'])
  expect(v.lanes[0]).toBe('LOCAL #4 Batch C — review')
  expect(v.lanes[1]).toMatch(/^LOCAL free — /)
  expect(v.next).toEqual(['[P2] #5 G1-G8  (after #4)'])
  expect(v.done).toEqual(['✓ #3 Batch B'])
})

test('#136 up next: no owner-waiting, blocked or cloud issues, and no "(ready)" reason', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 22, title: 'deploy', labels: lab('ready-for-agent', 'blocked', 'needs-orchestrator') },
    { number: 23, title: 'parked q', labels: lab('ready-for-agent', 'ready-for-human') },
    { number: 24, title: 'asks', labels: lab('ready-for-agent', 'needs-info') },
    { number: 25, title: 'in cloud', labels: lab('ready-for-agent', 'cloud') },
    { number: 26, title: 'free', labels: lab('ready-for-agent') },
  ], [], [], [])
  expect(v.next).toEqual(['[P2] #26 free'])
})

test('up next shows priority and sorts bug, then P0-P3, then number', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 1, title: 'low', labels: lab('ready-for-agent', 'P3') },
    { number: 2, title: 'normal', labels: lab('ready-for-agent') },
    { number: 3, title: 'high', labels: lab('ready-for-agent', 'P1') },
    { number: 4, title: 'urgent', labels: lab('ready-for-agent', 'P0') },
    { number: 5, title: 'bugfix', labels: lab('ready-for-agent', 'bug', 'P3') },
  ], [], [], [])
  expect(v.next).toEqual([
    '[P3] #5 bugfix', '[P0] #4 urgent', '[P1] #3 high',
    '[P2] #2 normal', '[P3] #1 low',
  ])
})

test('status line counts distinct issues, capped at 3', () => {
  const live = (name: string) => ({ name, state: 'live' })
  const d = {
    windows: ['issue-12', 'issue-12-fix', 'issue-13', 'issue-14', 'issue-15'].map(live),
    groups: groupIssues([]), lastLog: '', errors: [], updatedAt: 0,
  }
  expect(statusLine(d)).toMatch(/^lanes local 3\/3 /)
  d.windows = ['issue-12', 'issue-12-fix'].map(live)
  expect(statusLine(d)).toMatch(/^lanes local 1\/3 /)
})

test('express lane shows as ⚡ and express issues go first in up next', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 1, title: 'a', labels: lab('ready-for-agent', 'in-progress') },
    { number: 2, title: 'b', labels: lab('ready-for-agent', 'in-progress') },
    { number: 3, title: 'c', labels: lab('ready-for-agent', 'in-progress') },
    { number: 4, title: 'fast one', labels: lab('ready-for-agent', 'in-progress', 'express') },
    { number: 5, title: 'normal', labels: lab('ready-for-agent', 'P0') },
    { number: 6, title: 'approved', labels: lab('ready-for-agent', 'express', 'P3') },
  ], [], [], [])
  expect(v.lanes.length).toBe(4)
  expect(v.lanes[3]).toBe('LOCAL ⚡ #4 fast one — building')
  expect(v.lanes.slice(0, 3).some(l => l.includes('#4'))).toBe(false)
  expect(v.next).toEqual(['⚡ [P3] #6 approved', '[P0] #5 normal'])
})

test('no express issue: no ⚡ line', () => {
  const v = view([], [], [], [])
  expect(v.lanes.some(l => l.includes('⚡'))).toBe(false)
})

test('model label shows in up next and lanes, e.g. [P1·opus]', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const open = [
    { number: 1, title: 'ui', labels: lab('ready-for-agent', 'P1', 'model:opus') },
    { number: 2, title: 'plain', labels: lab('ready-for-agent', 'P2') },
    { number: 3, title: 'busy', labels: lab('in-progress', 'P1', 'model:fable') },
  ]
  const v = view(open, [], [], [])
  expect(v.next).toEqual(['[P1·opus] #1 ui', '[P2] #2 plain'])
  expect(laneReasons(open, [])[0]).toBe('1. #3 running [fable] · busy')
})

import { parseMaxCore } from './lanes'
test('max_core is read from config.toml, default 1', () => {
  expect(parseMaxCore('max_parallel = 3\nmax_core = 2   # core at once\n')).toBe(2)
  expect(parseMaxCore('max_parallel = 3\n')).toBe(1)
  expect(parseMaxCore('')).toBe(1)
  expect(parseMaxCore('max_core = 0\n')).toBe(1)
})

test('core lanes follow max_core', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const open = [
    { number: 4, title: 'C', labels: lab('core', 'ready-for-agent', 'in-progress') },
    { number: 5, title: 'G', labels: lab('core', 'ready-for-agent') },
  ]
  // limit 1: the second core issue waits and the reason says so
  expect(laneReasons(open, [], 3, 1)[1]).toMatch(/#5 ready but only 1 core at a time/)
  // limit 2: it can start
  const r2 = laneReasons(open, [], 3, 2)[1]
  expect(r2).toMatch(/starting soon: #5/)
  expect(r2).not.toMatch(/core at a time/)
  // message shows the real limit
  const three = [...open, { number: 6, title: 'H', labels: lab('core', 'ready-for-agent', 'in-progress') }, { number: 7, title: 'I', labels: lab('core', 'ready-for-agent') }]
  expect(laneReasons(three, [], 3, 2)[2]).toMatch(/#7 ready but only 2 core at a time/)
})

import { cloudRows, parseLocalLanes, needsRows, remoteFromStats } from './lanes'

test('#136 lanes line: local X/Y from config local_lanes, cloud = open issues labelled cloud', () => {
  expect(parseLocalLanes('local_lanes = 0   # all in the cloud\nremote_lanes = 4')).toBe(0)
  expect(parseLocalLanes('')).toBe(3)
  const d = { windows: [{ name: 'issue-7', state: 'live/working' }], groups: groupIssues([]), lastLog: '', errors: [], updatedAt: 0, localMax: 0, cloudCount: 4 }
  expect(statusLine(d)).toMatch(/^lanes local 1\/0 · cloud 4 · ready 0/)
})

test('#136 one row per cloud lane: state, last activity HH:MM (Israel), STALE, PR and session links', () => {
  const rows = cloudRows([
    { n: 140, title: 'Cloud thing', state: 'working', last: '2026-11-26T09:41:00Z', stale: true, pr: '', session: 'https://claude.ai/code/session_01A' },
    { n: 152, title: 'Other', state: 'done', last: '2026-11-26T10:05:00Z', stale: false, pr: 'https://github.com/x/y/pull/201', session: '' },
  ])
  expect(rows).toEqual([
    'CLOUD #140 Cloud thing — working · last 11:41 · STALE',
    '   session https://claude.ai/code/session_01A',
    'CLOUD #152 Other — done · last 12:05',
    '   PR https://github.com/x/y/pull/201',
  ])
  expect(cloudRows([])).toEqual([])
})

test('#136 every lane is LOCAL or CLOUD: label cloud or runner where=remote leave the local rows; local rows follow local_lanes', () => {
  const L = (...n: string[]) => n.map(name => ({ name }))
  const open = [
    { number: 1, title: 'local one', labels: L('in-progress') },
    { number: 2, title: 'cloud one', labels: L('in-progress', 'cloud') },
    { number: 3, title: 'runner remote', labels: L('in-progress') },
  ]
  const v = view(open, [], [{ name: 'issue-1', state: 'live/working' }], [], 2, 1, [3])
  expect(v.lanes).toEqual(['LOCAL #1 local one — building', expect.stringMatching(/^LOCAL free — /)])
  expect(view(open, [], [], [], 0, 1, [1, 3]).lanes).toEqual([])     // local_lanes = 0: no local rows at all
})

test('#136 runner stats: last start event decides local or remote', () => {
  const ev = (issue: number, where?: string, event = 'start') => JSON.stringify({ ts: 1, issue, event, ...(where ? { where } : {}) })
  expect(remoteFromStats([ev(3, 'remote'), ev(4, 'local'), ev(5, 'remote'), ev(5, 'local'), ev(6), ev(7, 'remote', 'worker_done'), 'junk'].join('\n'))).toEqual([3])
})

test('#136 NEEDS YOU / BLOCKED: open questions first, then blocked / ready-for-human / needs-info with reason and link', () => {
  expect(needsRows({
    questions: [{ window: '#185', text: 'צבע כחול או ירוק?', url: 'https://github.com/x/y/issues/205#c1' }],
    issues: [
      { n: 191, title: 'Runner error', url: 'https://github.com/x/y/issues/191', label: 'blocked', reason: 'Runner: BLOCKED: TimeoutExpired' },
      { n: 115, title: 'Token', url: 'https://github.com/x/y/issues/115', label: 'ready-for-human', reason: '' },
    ],
  })).toEqual([
    '? #185 צבע כחול או ירוק?', '   https://github.com/x/y/issues/205#c1',
    '⛔ #191 Runner error — Runner: BLOCKED: TimeoutExpired', '   https://github.com/x/y/issues/191',
    '! #115 Token — ready-for-human', '   https://github.com/x/y/issues/115',
  ])
  expect(needsRows({ questions: [], issues: [] })).toEqual([])
})
