import type { OrenLanesData, OrenLanesGroup } from '../types/index'

export type Issue = {
  number: number
  title: string
  body?: string | null
  labels?: { name: string }[]
}

export type Win = { name: string; state: string }

const NAME = /^(run|issue|review|intake)-/

/** Issue numbers named on "Blocked by:" lines of an issue body. */
export function parseBlockers(body: string | null | undefined): number[] {
  const out: number[] = []
  for (const line of (body ?? '').split('\n')) {
    const m = /blocked[ \t-]*by[^#]*(.*)$/i.exec(line)
    if (!m) continue
    for (const n of (m[1] ?? '').matchAll(/#(\d+)/g)) out.push(Number(n[1]))
  }
  return out
}

const empty = (): OrenLanesGroup => ({ count: 0, titles: [] })

export function groupIssues(issues: Issue[]): OrenLanesData['groups'] {
  const open = new Set(issues.map(i => i.number))
  const g = {
    running: empty(), ready: empty(), waiting: empty(),
    blocked: empty(), needsYou: empty(), triage: empty(),
  }
  const add = (grp: OrenLanesGroup, i: Issue) => {
    grp.count += 1
    grp.titles.push(`#${i.number} ${i.title}`)
  }
  for (const i of issues) {
    const l = new Set((i.labels ?? []).map(x => x.name))
    const hasOpenBlocker = parseBlockers(i.body).some(n => n !== i.number && open.has(n))
    if (l.has('in-progress')) add(g.running, i)
    else if (l.has('blocked')) add(g.blocked, i)
    else if (l.has('ready-for-human')) add(g.needsYou, i)
    else if (l.has('needs-triage')) add(g.triage, i)
    else if (l.has('ready-for-agent')) add(hasOpenBlocker ? g.waiting : g.ready, i)
  }
  return g
}

/** Terminals from `hc ls --json` whose label starts with run-/issue-/review-/intake-. */
export function parseWindows(json: string): Win[] {
  const data = JSON.parse(json) as { terminals?: Record<string, unknown>[] }
  const out: Win[] = []
  for (const t of data.terminals ?? []) {
    const where = typeof t.where === 'string' ? t.where : ''
    const cands = [t.name, t.label, t.title, t.address, where, where.split('/').pop()?.trim()]
    const name = cands
      .filter((c): c is string => typeof c === 'string')
      .map(c => c.trim())
      .find(c => NAME.test(c))
    if (!name) continue
    const st = [t.state, t.status].filter(x => typeof x === 'string' && x).join('/')
    out.push({ name, state: st || '?' })
  }
  return out
}

export const isLive = (w: Win) => w.state.split('/')[0] === 'live'

/** run-<n> windows that were live before and are gone or not live now. */
export function finishedRuns(prevLive: string[], now: Win[]): string[] {
  const live = new Set(now.filter(isLive).map(w => w.name))
  return prevLive.filter(n => /^run-/.test(n) && !live.has(n))
}

export function statusLine(d: OrenLanesData): string {
  const lanes = d.windows.filter(w => w.name.startsWith('issue-') && isLive(w)).length
  let s = `lanes ${lanes}/3 · ready ${d.groups.ready.count} · blocked ${d.groups.blocked.count}`
  const waiting = d.windows.filter(w => /^(issue|review|intake)-/.test(w.name) && w.state.endsWith('/blocked')).map(w => w.name)
  const you = [...d.groups.needsYou.titles.map(t => t.split(' ')[0]), ...waiting]
  if (you.length) s += ` · needs you: ${you.slice(0, 3).join(', ')}`
  if (d.usage) s += ` · ${d.usage.replace(/ → [^·]*?(?= ·|$)/g, '').trim()}`
  return s
}

export const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** "5h 23% → 21:00 · week 41% → Fri 09:00" (Israel time); '' when no reading (not on a subscription). */
export function usageText(limits: Limit[]): string {
  const fmt = (iso: string | undefined, withDay: boolean) => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      const opt: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }
      if (withDay) opt.weekday = 'short'
      return ' → ' + new Intl.DateTimeFormat('en-GB', opt).format(d)
    } catch { return '' }
  }
  const part = (kind: string, label: string, withDay: boolean) => {
    const l = limits.find(x => x.kind === kind)
    return l ? `${label} ${Math.round(l.percentUsed)}%${fmt(l.resetsAt, withDay)}` : ''
  }
  return [part('five_hour', '5h', false), part('seven_day', 'week', true)].filter(Boolean).join(' · ')
}
