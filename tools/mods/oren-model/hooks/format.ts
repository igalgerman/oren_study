// Pure formatting for the oren-model status line (#850).
export type StatusIn = { model?: string; effort?: string; mine?: number | null; five?: number | null; week?: number | null }

/** claude-<family>-<major>-<minor> -> 'Family major.minor'; anything else as is. */
export const modelName = (id: string): string => {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(id)
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : id
}

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** 41 -> '41%', 0.74 -> '0.7%'; a missing value is ''. */
export const pct = (n: number | null | undefined): string =>
  !num(n) ? '' : `${n < 1 ? Math.round(n * 10) / 10 : Math.round(n)}%`

export const statusText = ({ model, effort, mine, five, week }: StatusIn): string => {
  const head = model ? [effort ? `${modelName(model)} ${effort}` : modelName(model)] : []
  return [...head, `אני ${pct(mine) || 'n/a'}${pct(mine) ? ' מהשבוע' : ''}`, `5h ${pct(five) || 'n/a'}`, `שבוע ${pct(week) || 'n/a'}`].join(' · ')
}

/** The session's week share from usage_by_entity.json text; null when missing, bad, stale (> 3 h) or unknown id. */
export const sessionShare = (raw: string, id: string, nowMs: number): number | null => {
  try {
    const d = JSON.parse(raw)
    if (!num(d?.at) || nowMs / 1000 - d.at > 3 * 3600) return null
    const w = d.sessions?.[id]?.week_pct
    return num(w) ? w : null
  } catch { return null }
}

/** five_hour / seven_day percent from rateLimits, else from usage.json text ({five_h_pct, week_pct}). */
export const accountUsage = (limits: unknown, usageRaw: string): { five: number | null; week: number | null } => {
  const L = Array.isArray(limits) ? limits : []
  const get = (kind: string) => { const p = L.find((x: any) => x?.kind === kind)?.percentUsed; return num(p) ? p : null }
  let u: any = {}
  try { u = JSON.parse(usageRaw) ?? {} } catch {}
  const f = (v: unknown) => (num(v) ? v : null)
  return { five: get('five_hour') ?? f(u.five_h_pct), week: get('seven_day') ?? f(u.week_pct) }
}
