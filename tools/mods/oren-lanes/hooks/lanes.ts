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
  if (d.done) s += ` · ${d.done.replace('done: ', 'done ').replace(' in 24h', '/24h')}`
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

export const STAGES = ['Plan', 'Build', 'Review', 'Merge', 'Live'] as const

/** One line per issue: where it is in idea → build → review → merge+tests → live. */
export function flowRows(open: Issue[], closed: Issue[], wins: Win[], prBranches: string[]): string[] {
  const live = new Set(wins.filter(isLive).map(w => w.name))
  const has = (re: RegExp) => [...live].some(n => re.test(n))
  const openNums = new Set(open.map(i => i.number))
  const bar = (at: number, mark = '●') =>
    STAGES.map((s, k) => (k < at ? '✓' : k === at ? mark : '○') + s).join(' ')
  const rows: string[] = []
  for (const i of [...open].sort((a, b) => a.number - b.number)) {
    const l = new Set((i.labels ?? []).map(x => x.name)); const n = i.number
    let at = 1, mark = '·', note = ''
    if (l.has('needs-triage')) { at = 0; mark = '?'; note = 'needs grilling' }
    else if (l.has('ready-for-human') && !l.has('in-progress')) { at = 0; mark = '!'; note = 'your task' }
    if (l.has('in-progress')) {
      mark = '●'
      if (has(new RegExp(`^review-${n}(-|$)`))) at = 2
      else if (has(new RegExp(`^issue-${n}(-|$)`)) && !prBranches.includes(`lane/${n}`)) at = 1
      else if (prBranches.includes(`lane/${n}`)) at = has(new RegExp(`^issue-${n}-fix$`)) ? 1 : 3
    } else if (!note) {
      const wait = parseBlockers(i.body).filter(b => openNums.has(b))
      note = wait.length ? `waits for #${wait.join(', #')}` : 'next in line'
    }
    if (l.has('blocked')) { mark = '⛔'; note = 'blocked — see issue' }
    rows.push(`#${n} ${bar(at, mark)}${note ? '  ' + note : ''}  · ${i.title}`)
  }
  for (const i of closed.slice(0, 3)) rows.push(`#${i.number} ${bar(5)}  · ${i.title}`)
  return rows
}

export type StatEvent = { ts: number; issue: number; event: string }

const dur = (s: number | null) => {
  if (s === null) return '-'
  const m = Math.round(s / 60)
  return m < 90 ? `${m}m` : `${(s / 3600).toFixed(1)}h`
}

/** Stats lines from stats.jsonl text (ts in epoch seconds); [] when there are no events. */
export function statsLines(text: string, nowSec: number): string[] {
  const per = new Map<number, { start: number; build?: number; wd?: number; review?: number; merge?: number; mergedAt?: number }>()
  const evs: StatEvent[] = []
  for (const l of text.split('\n')) {
    try { const e = JSON.parse(l) as StatEvent; if (typeof e.ts === 'number') evs.push(e) } catch { /* skip */ }
  }
  evs.sort((a, b) => a.ts - b.ts)
  for (const e of evs) {
    if (e.event === 'start') { per.set(e.issue, { start: e.ts }); continue }
    const p = per.get(e.issue)
    if (!p) continue
    if (e.event === 'worker_done' && p.build === undefined) { p.build = e.ts - p.start; p.wd = e.ts }
    else if (e.event === 'review_pass' && p.wd !== undefined) p.review = e.ts - p.wd
    else if (e.event === 'merged') { p.merge = e.ts - p.start; p.mergedAt = e.ts }
  }
  const all = [...per.entries()]
  if (!all.length) return []
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const ps = all.map(([, p]) => p)
  const merged = ps.filter(p => p.merge !== undefined)
  const m24 = merged.filter(p => (p.mergedAt ?? 0) > nowSec - 86400).length
  const [n, last] = all.reduce((a, b) => (b[1].start > a[1].start ? b : a))
  return [
    `merged ${m24} in 24h · ${merged.length} total`,
    `avg to merge ${dur(avg(merged.map(p => p.merge as number)))}`,
    `avg build ${dur(avg(ps.filter(p => p.build !== undefined).map(p => p.build as number)))} · review ${dur(avg(ps.filter(p => p.review !== undefined).map(p => p.review as number)))}`,
    `last #${n}: build ${dur(last.build ?? null)} · review ${dur(last.review ?? null)} · merge ${dur(last.merge ?? null)}`,
  ]
}

/** One line per lane (3): what runs in it, or WHY it is free. */
export function laneReasons(open: Issue[], wins: Win[], max = 3): string[] {
  const lab = (i: Issue) => new Set((i.labels ?? []).map(x => x.name))
  const openNums = new Set(open.map(i => i.number))
  const running = open.filter(i => lab(i).has('in-progress'))
  const rows = running.map((i, k) => `${k + 1}. #${i.number} running · ${i.title}`)
  if (rows.length >= max) return rows.slice(0, max)
  const coreBusy = running.some(i => lab(i).has('core'))
  const ready = open.filter(i => { const l = lab(i); return l.has('ready-for-agent') && !l.has('in-progress') && !l.has('blocked')
    && !parseBlockers(i.body).some(b => b !== i.number && openNums.has(b)) })
  const startable = ready.filter(i => !(coreBusy && (lab(i).has('core') || !['pack', 'review'].some(x => lab(i).has(x)))))
  const why: string[] = []
  if (startable.length) why.push(`starting soon: #${startable.map(i => i.number).join(', #')}`)
  const coreWait = ready.filter(i => !startable.includes(i))
  if (coreWait.length) why.push(`#${coreWait.map(i => i.number).join(', #')} ready but only 1 core at a time`)
  const waits = open.filter(i => lab(i).has('ready-for-agent') && !lab(i).has('in-progress') && parseBlockers(i.body).some(b => b !== i.number && openNums.has(b)))
  if (waits.length) why.push(`${waits.length} wait in the chain (${waits.map(i => '#' + i.number).slice(0, 4).join(' ')}${waits.length > 4 ? ' …' : ''})`)
  const you = open.filter(i => lab(i).has('ready-for-human') || lab(i).has('needs-triage'))
  if (you.length) why.push(`need you first: #${you.map(i => i.number).join(', #')}`)
  const reason = why.length ? why.join(' · ') : 'backlog empty — add work with /idea or /task'
  for (let k = rows.length; k < max; k++) rows.push(`${k + 1}. free — ${reason}`)
  return rows
}
