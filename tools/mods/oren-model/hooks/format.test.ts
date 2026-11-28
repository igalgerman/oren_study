import { expect, test } from 'claude-code/testing'
import { accountUsage, modelName, pct, sessionShare, statusText } from './format'

test('status text', () => {
  expect(statusText({ model: 'claude-opus-5-5', effort: 'high', mine: 3, five: 41, week: 62 })).toBe('Opus 5.5 high · אני 3% מהשבוע · 5h 41% · שבוע 62%')
  expect(statusText({ model: 'claude-sonnet-5-5', effort: 'medium', mine: 3, five: 41, week: 62 })).toMatch('Sonnet 5.5 medium · ')
  expect(statusText({ model: 'claude-sonnet-5-5', mine: 3, five: 1, week: 2 })).toBe('Sonnet 5.5 · אני 3% מהשבוע · 5h 1% · שבוע 2%')
  expect(statusText({ model: 'weird-model', effort: 'low' })).toMatch('weird-model low · ')
  expect(pct(0.74)).toBe('0.7%')
  expect(statusText({ model: 'claude-opus-5-5', mine: 0.7, five: 41, week: 62 })).toMatch('אני 0.7% מהשבוע')
})

test('missing inputs degrade', () => {
  expect(statusText({})).toBe('אני n/a · 5h n/a · שבוע n/a')
  expect(statusText({ mine: null, five: 5, week: null })).toBe('אני n/a · 5h 5% · שבוע n/a')
  expect(modelName('claude-fable-5-2')).toBe('Fable 5.2')
})

test('session share: stale, bad, unknown', () => {
  const now = 1_800_000_000e3
  const f = (at: number) => JSON.stringify({ at, sessions: { s1: { week_pct: 3 } } })
  expect(sessionShare(f(now / 1000 - 60), 's1', now)).toBe(3)
  expect(sessionShare(f(now / 1000 - 4 * 3600), 's1', now)).toBe(null)
  expect(sessionShare(f(now / 1000), 'zzz', now)).toBe(null)
  expect(sessionShare('not json', 's1', now)).toBe(null)
  expect(sessionShare('', 's1', now)).toBe(null)
  expect(sessionShare(JSON.stringify({ at: now / 1000, sessions: { s1: { week_pct: null } } }), 's1', now)).toBe(null)
})

test('account usage: rateLimits, fallback to usage.json, n/a', () => {
  const lim = [{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 62 }]
  expect(accountUsage(lim, '')).toEqual({ five: 41, week: 62 })
  expect(accountUsage([], '{"five_h_pct": 10, "week_pct": 20}')).toEqual({ five: 10, week: 20 })
  expect(accountUsage([], 'junk')).toEqual({ five: null, week: null })
  expect(accountUsage(undefined, '')).toEqual({ five: null, week: null })
})
