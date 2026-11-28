import { expect, test } from 'claude-code/testing'
import { register } from './register'

const setup = (over: any = {}) => {
  const hooks: Record<string, any> = {}
  register(((name: string, fn: any) => { hooks[name] = fn }) as any)
  const status: string[] = []
  let tick: any
  const files: Record<string, string> = over.files ?? {}
  const $ = {
    fs: { read: async (p: string) => { if (!(p in files)) throw new Error('nofile'); return files[p] } },
    clock: { now: async () => 1_800_000_000e3, every: (_: number, f: any) => { tick = f; return { cancel() {} } } },
    session: { id: async () => 's1', usage: async () => { if (over.usageThrows) throw new Error('x'); return { rateLimits: over.limits ?? [] } } },
    ui: { status: (t: string) => status.push(t) },
  }
  return { hooks, $, status, tick: () => tick }
}
const wait = () => new Promise(r => setTimeout(r, 20))
const R = 'C:/work/Oren_study/a/tools/runner/.runs'

test('turn.step returns next(e) unchanged, also for subagents and odd input', async () => {
  const { hooks, $ } = setup()
  for (const e of [{ model: 'claude-opus-5-5', effort: 'high' }, { agentId: 'x', model: 'claude-haiku-5-5' }, {}, null as any]) {
    const same = { sentinel: 1 }
    expect(await hooks['turn.step']($, e, async (x: any) => (x === e ? same : null))).toBe(same)
  }
})

test('status shows model + usage, ignores subagent steps, and never throws', async () => {
  const { hooks, $, status } = setup({
    limits: [{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 62 }],
    files: { [`${R}/usage_by_entity.json`]: JSON.stringify({ at: 1_800_000_000, sessions: { s1: { week_pct: 3 } } }) },
  })
  await hooks['session.start']($, { cwd: 'x' }, async (e: any) => e)
  await wait()
  expect(status[status.length - 1]).toBe('אני 3% מהשבוע · 5h 41% · שבוע 62%')   // no model yet
  await hooks['turn.step']($, { model: 'claude-opus-5-5', effort: 'high' }, async (e: any) => e)
  await wait()
  expect(status[status.length - 1]).toBe('Opus 5.5 high · אני 3% מהשבוע · 5h 41% · שבוע 62%')
  await hooks['turn.step']($, { agentId: 'a', model: 'claude-haiku-5-5', effort: 'low' }, async (e: any) => e)
  await wait()
  expect(status[status.length - 1]).toMatch('Opus 5.5 high')
})

test('nothing readable: n/a everywhere, no throw', async () => {
  const { hooks, $, status } = setup({ usageThrows: true })
  await hooks['session.start']($, {}, async (e: any) => e)
  await wait()
  expect(status[status.length - 1]).toBe('אני n/a · 5h n/a · שבוע n/a')
})
