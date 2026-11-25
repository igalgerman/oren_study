import { expect, test } from 'claude-code/testing'

import {
  finishedRuns, groupIssues, parseBlockers, parseWindows, statusLine,
} from './lanes'

test('blocked-by parsing', () => {
  expect(parseBlockers('Blocked by: #7, #9\ntext')).toEqual([7, 9])
  expect(parseBlockers('**Blocked by:** #3')).toEqual([3])
  expect(parseBlockers('see #4 only')).toEqual([])
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
  expect(statusLine(d)).toBe('lanes 1/3 · ready 0 · blocked 0')
  groups.needsYou.count = 2
  expect(statusLine(d)).toMatch(/^lanes 1\/3 · ready 0 · blocked 0/)
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
  expect(v.next).toEqual(['#5 G1-G8  (after #4)'])
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

test('status line counts distinct issues, capped at 3', () => {
  const live = (name: string) => ({ name, state: 'live' })
  const d = {
    windows: ['issue-12', 'issue-12-fix', 'issue-13', 'issue-14', 'issue-15'].map(live),
    groups: groupIssues([]), lastLog: '', errors: [], updatedAt: 0,
  }
  expect(statusLine(d)).toMatch(/^lanes 3\/3 /)
  d.windows = ['issue-12', 'issue-12-fix'].map(live)
  expect(statusLine(d)).toMatch(/^lanes 1\/3 /)
})
