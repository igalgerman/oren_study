import type { Register } from 'claude-code'
import { accountUsage, sessionShare, statusText } from './format'

const RUNS = 'C:/work/Oren_study/a/tools/runner/.runs'

export const register: Register = on => {
  let model: string | undefined
  let effort: string | undefined
  let refreshFn: (() => Promise<void>) | undefined

  on('turn.step', async function* ($, e: any, next) {
    if (e?.agentId === undefined) {
      if (typeof e?.model === 'string') model = e.model
      effort = typeof e?.effort === 'string' ? e.effort : undefined
      if (refreshFn) void refreshFn()
    }
    return yield* next(e)
  })

  on('session.start', async ($, e, next) => {
    const readText = async (p: string) => { try { return (await $.fs.read(p)) as string } catch { return '' } }
    refreshFn = async () => {
      try {
        const now = await $.clock.now()
        let mine: number | null = null
        try { mine = sessionShare(await readText(`${RUNS}/usage_by_entity.json`), String(await $.session.id()), now) } catch {}
        let limits: unknown = []
        try { limits = (await $.session.usage()).rateLimits } catch {}
        const { five, week } = accountUsage(limits, await readText(`${RUNS}/usage.json`))
        $.ui.status(statusText({ model, effort, mine, five, week }))
      } catch {}
    }
    void refreshFn()
    $.clock.every(60000, () => { void refreshFn?.() })
    return next(e)
  })
}
