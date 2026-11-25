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
