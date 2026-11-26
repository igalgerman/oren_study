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
  expect(statusLine(d)).toBe('lanes local 1/3 · cloud 0/0 · ready 0 · blocked 0')
  groups.needsYou.count = 2
  expect(statusLine(d)).toMatch(/^lanes local 1\/3 · cloud 0/0 · ready 0 · blocked 0/)
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
  expect(v.lanes[0]).toBe('● #4 Batch C — review')
  expect(v.lanes[1]).toMatch(/^○ free — /)
  expect(v.you).toEqual(['! #10 voice — your task', '? #11 math ideas — answer questions'])
  expect(v.orch).toEqual([])
  expect(v.next).toEqual(['[P2] #5 G1-G8  (after #4)'])
  expect(v.done).toEqual(['✓ #3 Batch B'])
})

test('blocked + needs-orchestrator stays out of your lane', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 22, title: 'deploy', labels: lab('blocked', 'needs-orchestrator') },
    { number: 23, title: 'parked q', labels: lab('blocked', 'ready-for-human') },
    { number: 24, title: 'old blocked', labels: lab('blocked') },
  ], [], [], [])
  expect(v.you).toEqual(['! #23 parked q — your task'])
  expect(v.orch).toEqual(['orchestrator handling: #22 #24'])
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
    '[P3] #5 bugfix  (ready)', '[P0] #4 urgent  (ready)', '[P1] #3 high  (ready)',
    '[P2] #2 normal  (ready)', '[P3] #1 low  (ready)',
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
  expect(v.lanes[3]).toBe('⚡ #4 fast one — building')
  expect(v.lanes.slice(0, 3).some(l => l.includes('#4'))).toBe(false)
  expect(v.next).toEqual(['⚡ [P3] #6 approved  (ready)', '[P0] #5 normal  (ready)'])
})

test('no express issue: no ⚡ line', () => {
  const v = view([], [], [], [])
  expect(v.lanes.some(l => l.startsWith('⚡'))).toBe(false)
})

test('model label shows in up next and lanes, e.g. [P1·opus]', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 1, title: 'ui', labels: lab('ready-for-agent', 'P1', 'model:opus') },
    { number: 2, title: 'plain', labels: lab('ready-for-agent', 'P2') },
    { number: 3, title: 'busy', labels: lab('in-progress', 'P1', 'model:fable') },
  ], [], [], [])
  expect(v.next).toEqual(['[P1·opus] #1 ui  (ready)', '[P2] #2 plain  (ready)'])
  expect(v.lanes[0]).toBe('1. #3 running [fable] · busy')
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

test('your lane shows the open intake window', () => {
  const lab = (...n: string[]) => n.map(name => ({ name }))
  const open = [{ number: 8, title: 'Idea about maps', labels: lab('needs-triage') }, { number: 9, title: 'Other', labels: lab('needs-info') }]
  const v = view(open, [], [{ name: 'intake-8', state: 'live/working' }], [])
  expect(v.you[0]).toBe('▶ #8 Idea about maps — intake window open')
  expect(v.you[1]).toMatch(/^\? #9 /)
  expect(v.lanes.some(l => l.includes('#8'))).toBe(false)
})

import { cloudRows, parseLocalLanes, parseRemoteLanes } from './lanes'

test('#136 lanes line: local X/Y from config local_lanes, cloud = open issues labelled cloud', () => {
  expect(parseLocalLanes('local_lanes = 0   # all in the cloud\nremote_lanes = 4')).toBe(0)
  expect(parseRemoteLanes('local_lanes = 0\nremote_lanes = 4')).toBe(4)
  expect(parseLocalLanes('')).toBe(3)
  const d = { windows: [{ name: 'issue-7', state: 'live/working' }], groups: groupIssues([]), lastLog: '', errors: [], updatedAt: 0, localMax: 0, remoteMax: 4, cloudCount: 4 }
  expect(statusLine(d)).toMatch(/^lanes local 1\/0 · cloud 4\/4 · ready 0/)
})

test('#136 one row per cloud lane: state, last activity HH:MM (Israel), STALE, PR and session links', () => {
  const rows = cloudRows([
    { n: 140, title: 'Cloud thing', state: 'working', last: '2026-11-26T09:41:00Z', stale: true, pr: '', session: 'https://claude.ai/code/session_01A' },
    { n: 152, title: 'Other', state: 'done', last: '2026-11-26T10:05:00Z', stale: false, pr: 'https://github.com/x/y/pull/201', session: '' },
  ])
  expect(rows).toEqual([
    '☁ #140 Cloud thing — working · last 11:41 · STALE',
    '   session https://claude.ai/code/session_01A',
    '☁ #152 Other — done · last 12:05',
    '   PR https://github.com/x/y/pull/201',
  ])
  expect(cloudRows([])).toEqual([])
})

test('#136 cloud issues stay out of the local lane rows; local rows unchanged', () => {
  const L = (...n: string[]) => n.map(name => ({ name }))
  const v = view([
    { number: 1, title: 'local one', labels: L('in-progress') },
    { number: 2, title: 'cloud one', labels: L('in-progress', 'cloud') },
  ], [], [{ name: 'issue-1', state: 'live/working' }], [])
  expect(v.lanes[0]).toBe('● #1 local one — building')
  expect(v.lanes.some(s => s.includes('#2'))).toBe(false)
})
