import type { Panel, Row } from '../types/index'

export type Issue = {
  number: number
  title: string
  body?: string | null
  labels?: { name: string }[]
  createdAt?: string
  closedAt?: string
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

export const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** #239: the reading the runner's usage governor needs (written to .runs/usage.json every refresh); null when there is no 5h reading. */
export function usageJson(limits: Limit[], nowMs: number) {
  const f = limits.find(x => x.kind === 'five_hour'), w = limits.find(x => x.kind === 'seven_day')
  if (!f) return null
  return { five_h_pct: f.percentUsed, five_h_reset: f.resetsAt ?? null, week_pct: w ? w.percentUsed : null, week_reset: w?.resetsAt ?? null, at: new Date(nowMs).toISOString() }
}

/** #239: the runner's governor state from .runs/governor.json (reset in epoch seconds). */
export type Gov = { lanes?: number; stop?: boolean; pct?: number | null; projected?: number | null; reset?: number | null; text?: string; at?: number }

export function parseGov(json: string): Gov | null {
  try { const g = JSON.parse(json); return g && typeof g === 'object' ? g as Gov : null } catch { return null }
}

const num = (re: RegExp, toml: string, dflt: number) => { const m = re.exec(toml); return m ? Number(m[1]) : dflt }

/** Lane limits from tools/runner/config.toml text (defaults when missing). */
export function parseConfig(toml: string): Cfg {
  const maxCore = num(/^\s*max_core\s*=\s*(\d+)/m, toml, 1)
  return {
    local: num(/^\s*local_lanes\s*=\s*(\d+)/m, toml, 3),
    remote: num(/^\s*remote_lanes\s*=\s*(\d+)/m, toml, 0),
    express: num(/^\s*express_lanes\s*=\s*(\d+)/m, toml, 0),
    maxCore: maxCore >= 1 ? maxCore : 1,
    goal: num(/^\s*governor_target\s*=\s*(\d+)/m, toml, 99),
  }
}

/** #136: a row of `python tools/runner/remote.py cloud`. last = ISO UTC of the newest comment/commit. */
export type CloudLane = { n: number; title: string; state: string; line?: string; last: string; stale: boolean; pr: string; session: string; manual?: boolean }

export type StatEvent = { ts: number; issue: number; event: string }

/** stats.jsonl text -> events sorted by time (bad lines skipped). */
export function parseEvents(text: string): StatEvent[] {
  const out: StatEvent[] = []
  for (const l of text.split('\n')) {
    try { const e = JSON.parse(l) as StatEvent; if (typeof e.ts === 'number' && typeof e.issue === 'number') out.push(e) } catch { /* skip */ }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

export type Check = { conclusion?: string; status?: string; state?: string }
export type Pr = {
  number: number; headRefName: string; createdAt: string; isDraft?: boolean
  mergeable?: string; autoMergeRequest?: unknown; closingIssuesReferences?: { number: number }[]; statusCheckRollup?: Check[]
}

/** The issue a PR works on: lane/<n> branch, else the first issue it closes. */
export const prIssue = (p: Pr) => { const m = /^lane\/(\d+)/.exec(p.headRefName); return m ? Number(m[1]) : p.closingIssuesReferences?.[0]?.number }
export const isRed = (p: Pr) => (p.statusCheckRollup ?? []).some(c => /^(FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$/.test(c.conclusion || c.state || ''))
export const isConflict = (p: Pr) => p.mergeable === 'CONFLICTING'

export type Cfg = { local: number; remote: number; express: number; maxCore: number; goal: number }

export type PanelIn = {
  now: number                     // ms
  open: Issue[]
  closed: Issue[]                 // with closedAt
  prs: Pr[]
  wins: Win[]
  cloud: CloudLane[]
  events: StatEvent[]
  where: Record<number, string>   // .runs/<n>/where
  gov: Gov | null
  limits: Limit[]
  questions: number               // open owner questions (owner_q.py open)
  questionIssue?: number          // the pinned 'Questions for the owner' issue
  pc?: { text: string; alarm?: boolean } | null   // #293: .runs/pc.json when present
  refusedAt?: number              // .runs/remote_refused.json 'at' (epoch s)
  cfg: Cfg
}

export const AMBER_MIN = 30
const labs = (i: Issue) => new Set((i.labels ?? []).map(x => x.name))
const prio = (i: Issue) => [0, 1, 2, 3].find(n => labs(i).has(`P${n}`)) ?? 2
const short = (t: string, n = 26) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
const DONE_EV = new Set(['ended', 'merged', 'blocked', 'parked', 'deployed'])

/** HH:MM Israel time; with a weekday when it is not today. */
export function clock(ms: number, nowMs = ms): string {
  const tz = 'Asia/Jerusalem'
  const day = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'short' }).format(new Date(t))
  const opt: Intl.DateTimeFormatOptions = { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }
  if (day(ms) !== day(nowMs)) opt.weekday = 'short'
  return new Intl.DateTimeFormat('en-GB', opt).format(new Date(ms))
}

export const ago = (min: number) => (min < 90 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`)

export type Lane = { n: number; kind: 'local' | 'cloud' | 'express'; step: string; since: number; pr?: number; tone: Row['tone']; title: string; manual?: boolean }

/** The step one lane is in, from its windows, PR, cloud row and last runner event. */
export function laneStep(i: Issue, p: PanelIn, pr: Pr | undefined, coreBusy: boolean): { step: string; since: number; bad: boolean } {
  const n = i.number, l = labs(i)
  const c = p.cloud.find(x => x.n === n && x.state !== 'done')
  const wins = p.wins.filter(w => isLive(w) && new RegExp(`^(issue|review|intake)-${n}(-|$)`).test(w.name))
  const has = (re: RegExp) => wins.some(w => re.test(w.name))
  const evs = p.events.filter(e => e.issue === n)
  const last = evs[evs.length - 1]
  const times = [last ? last.ts * 1000 : 0, c ? Date.parse(c.last) || 0 : 0, pr ? Date.parse(pr.createdAt) || 0 : 0]
  const since = Math.max(...times) || p.now
  if (l.has('blocked') || c?.state === 'stuck') {
    const why = (c?.line ?? '').replace(/^RESULT: STUCK\s*/, '').trim()
      || (pr && isConflict(pr) ? 'PR conflicts' : pr && isRed(pr) ? 'CI red' : l.has('ready-for-human') ? 'waits for you' : 'see issue')
    return { step: `blocked: ${why}`, since, bad: true }
  }
  if (c?.state === 'question') return { step: 'blocked: question for you', since, bad: true }
  if (wins.some(w => w.state.endsWith('/blocked'))) return { step: 'blocked: window waits for input', since, bad: true }
  if (c?.stale) return { step: 'blocked: no cloud activity', since, bad: true }
  if (!pr && c?.state === 'waiting review') return { step: 'waiting review', since, bad: false }   // #297: cloud PR open + quiet, no 'Fixes #n' link
  if (pr) {
    if (isConflict(pr)) return { step: 'resolving conflict', since, bad: false }
    if (isRed(pr) || has(new RegExp(`^issue-${n}-fix`)) || last?.event === 'review_fix') return { step: 'fixing', since, bad: false }
    if (has(new RegExp(`^review-${n}(-|$)`))) return { step: 'in review', since, bad: false }
    if (pr.autoMergeRequest || last?.event === 'review_pass') return { step: 'merging', since, bad: false }
    return { step: 'waiting review', since, bad: false }
  }
  if (l.has('core') && coreBusy && !c && !wins.length && (!last || DONE_EV.has(last.event))) return { step: 'waiting core slot', since, bad: false }
  return { step: 'building', since, bad: false }
}

/** Forecast time (ms) for `openN` issues from the net close rate over 6 h (else 24 h); null when not shrinking. */
export function eta(openN: number, closedMs: number[], openedMs: number[], now: number): number | null {
  for (const h of [6, 24]) {
    const from = now - h * 3600e3
    const rate = (closedMs.filter(t => t > from).length - openedMs.filter(t => t > from).length) / h
    if (rate > 0) return now + (openN / rate) * 3600e3
  }
  return null
}

/** The whole panel (pure): header, NEEDS YOU, PC, one lane list, PRs, UP NEXT, DONE, forecast. */
export function panel(p: PanelIn): Panel {
  const { now, cfg } = p
  const openNums = new Set(p.open.map(i => i.number))
  const byNum = new Map(p.open.map(i => [i.number, i]))
  const prOf = new Map<number, Pr>()
  for (const pr of p.prs) { const n = prIssue(pr); if (n && !prOf.has(n)) prOf.set(n, pr) }

  // NEEDS YOU: open owner questions + issues waiting on the owner
  const youIssues = p.open.filter(i => { const l = labs(i); return l.has('ready-for-human') || l.has('needs-triage') || l.has('needs-info') })
  const youSet = new Set(youIssues.map(i => i.number))

  // LANES: running + active cloud + issues with an open PR (finished ones never listed)
  const laneNums = new Set<number>()
  for (const i of p.open) if (labs(i).has('in-progress')) laneNums.add(i.number)
  for (const c of p.cloud) if (c.state !== 'done' && openNums.has(c.n)) laneNums.add(c.n)
  for (const n of prOf.keys()) if (openNums.has(n)) laneNums.add(n)
  for (const n of youSet) if (!labs(byNum.get(n)!).has('in-progress') && !prOf.has(n)) laneNums.delete(n)
  const lanesIssues = [...laneNums].map(n => byNum.get(n)!).sort((a, b) => a.number - b.number)
  const coreActive = lanesIssues.filter(i => labs(i).has('core') && p.events.some(e => e.issue === i.number && e.event === 'start')).length
  const lanes: Lane[] = lanesIssues.map(i => {
    const pr = prOf.get(i.number)
    const s = laneStep(i, p, pr, coreActive >= cfg.maxCore)
    const kind: Lane['kind'] = labs(i).has('express') ? 'express'
      : p.where[i.number] === 'remote' || labs(i).has('cloud') || p.cloud.some(c => c.n === i.number) ? 'cloud' : 'local'
    const tone: Row['tone'] = s.bad ? 'red' : now - s.since > AMBER_MIN * 60e3 ? 'amber' : ''
    const cloudRow = p.cloud.find(c => c.n === i.number && c.state !== 'done')
    const cloudPr = Number(/\/pull\/(\d+)/.exec(cloudRow?.pr ?? '')?.[1]) || undefined
    return { n: i.number, kind, step: s.step, since: s.since, pr: pr?.number ?? cloudPr, tone, title: i.title, manual: cloudRow?.manual }
  })
  const rank = { red: 0, amber: 1, '': 2, dim: 3 }
  lanes.sort((a, b) => rank[a.tone] - rank[b.tone] || a.n - b.n)
  const icon = { local: '●', cloud: '☁', express: '⚡' }
  const laneRows: Row[] = lanes.map(x => ({
    text: `${icon[x.kind]} #${x.n} ${short(x.title)} — ${x.step}${x.pr ? ` · PR #${x.pr}` : ''}${x.manual ? ' · manual' : ''} · ${clock(x.since, now)}`, tone: x.tone,
  }))

  // UP NEXT: ready work that has no lane, no PR and is not waiting on the owner
  const nextAll = p.open.filter(i => { const l = labs(i); return l.has('ready-for-agent') && !l.has('in-progress') && !l.has('blocked') && !laneNums.has(i.number) && !youSet.has(i.number) })
    .sort((a, b) => prio(a) - prio(b) || +!labs(a).has('express') - +!labs(b).has('express') || a.number - b.number)
  const waitsOn = (i: Issue) => parseBlockers(i.body).filter(b => b !== i.number && openNums.has(b))
  const next: Row[] = nextAll.slice(0, 5).map(i => {
    const w = waitsOn(i)
    return { text: `${labs(i).has('express') ? '⚡ ' : ''}P${prio(i)} #${i.number} ${short(i.title, 30)}${w.length ? `  (after #${w.join(', #')})` : ''}`, tone: 'dim' }
  })

  // starts: will a new task start now?
  const cap = cfg.local + (p.gov?.lanes ?? cfg.remote) + cfg.express
  const stopped = !!p.gov?.stop && !(p.gov.reset && p.gov.reset * 1000 <= now)
  const paused = p.refusedAt !== undefined && now - p.refusedAt * 1000 < 3600e3
  const ready = nextAll.filter(i => !waitsOn(i).length)
  const starts: Row = stopped ? { text: `new starts STOPPED: 5h at ${Math.round(p.gov?.pct ?? 0)}%`, tone: 'red' }
    : paused ? { text: `cloud starts paused until ${clock(p.refusedAt! * 1000 + 3600e3, now)}`, tone: 'amber' }
    : lanes.length >= cap ? { text: 'all lanes busy', tone: 'dim' }
    : ready.length ? { text: `next start: #${ready[0]!.number}`, tone: 'dim' }
    : { text: 'nothing ready to start — add work (/idea, /task)', tone: 'amber' }

  // PRs
  const waitingPr = (pr: Pr) => !pr.isDraft && !pr.autoMergeRequest
  const conflict = p.prs.filter(isConflict), red = p.prs.filter(pr => isRed(pr) && !isConflict(pr))
  const review = p.prs.filter(pr => waitingPr(pr) && !isConflict(pr) && !isRed(pr))
  const auto = p.prs.filter(pr => pr.autoMergeRequest)
  const stuckPrs = [...review, ...conflict, ...red]
  const oldest = stuckPrs.reduce<Pr | undefined>((a, b) => (!a || Date.parse(b.createdAt) < Date.parse(a.createdAt) ? b : a), undefined)
  const oldMin = oldest ? (now - Date.parse(oldest.createdAt)) / 60e3 : 0
  const prParts = [`${p.prs.length} open`, review.length && `${review.length} need review`, conflict.length && `${conflict.length} conflict`,
    red.length && `${red.length} red`, auto.length && `${auto.length} auto-merge`, oldest && `oldest #${oldest.number} ${ago(oldMin)}`].filter(Boolean)
  const prRow: Row = {
    text: `PRs ${prParts.join(' · ')}`,
    tone: oldMin > AMBER_MIN ? 'amber' : '',
  }

  // DONE (last hour) + header counts
  const closedAt = (i: Issue) => Date.parse(i.closedAt ?? '') || 0
  const closed = [...p.closed].sort((a, b) => closedAt(b) - closedAt(a))
  const hour = closed.filter(i => closedAt(i) > now - 3600e3)
  const day = closed.filter(i => closedAt(i) > now - 86400e3).length
  const done: Row[] = closed.filter(i => !laneNums.has(i.number) && !openNums.has(i.number)).slice(0, 3)
    .map(i => ({ text: `✓ #${i.number} ${short(i.title, 30)} · ${clock(closedAt(i), now)}`, tone: 'dim' }))
  const count = (n: number) => p.open.filter(i => labs(i).has(`P${n}`)).length

  // usage: 5h now -> projected at reset vs goal; week vs an even pace
  const header: Row[] = [{ text: `P0 ${count(0)} · P1 ${count(1)} · done ${day}/24h`, tone: '' }]
  const five = p.limits.find(x => x.kind === 'five_hour'), week = p.limits.find(x => x.kind === 'seven_day')
  const parts: string[] = []
  let warn = false
  const pct5 = five?.percentUsed ?? p.gov?.pct ?? null
  if (pct5 !== null && pct5 !== undefined) {
    const proj = p.gov?.projected
    let s = `5h ${Math.round(pct5)}%`
    if (proj !== null && proj !== undefined) {
      s += ` → ~${Math.round(proj)}%${p.gov?.reset ? ` at ${clock(p.gov.reset * 1000, now)}` : ''}`
      if (proj < cfg.goal - 20) warn = true
    }
    parts.push(`${s} (goal ${cfg.goal})`)
  }
  if (week) {
    const reset = Date.parse(week.resetsAt ?? '')
    const even = reset ? Math.max(0, Math.min(100, 100 * (1 - (reset - now) / (7 * 86400e3)))) : null
    parts.push(`week ${Math.round(week.percentUsed)}%${even !== null ? ` (even ${Math.round(even)}%)` : ''}`)
    if (even !== null && week.percentUsed > even + 10) warn = true
  }
  const stale = p.gov?.at !== undefined && now - p.gov.at * 1000 > 15 * 60e3   // the runner's own cutoff
  if (parts.length) header.push({ text: parts.join(' · ') + (stale ? ' (stale)' : ''), tone: warn ? 'amber' : 'dim' })

  const youShown = youIssues.filter(i => !laneNums.has(i.number))   // a lane already shows 'blocked: waits for you'
  const you = [...(p.questions ? [`${p.questions} question${p.questions > 1 ? 's' : ''}${p.questionIssue ? ` (#${p.questionIssue})` : ''}`] : []),
    ...youShown.map(i => `#${i.number}`)]
  const needsYou: Row | null = you.length ? { text: `NEEDS YOU: ${you.join(' · ')}`, tone: 'red' } : null
  const pc: Row | null = p.pc?.text ? { text: p.pc.text, tone: p.pc.alarm ? 'red' : 'dim' } : null

  // forecast
  const p0 = (i: Issue) => labs(i).has('P0')
  const all = [...p.open, ...p.closed]
  const created = (xs: Issue[]) => xs.map(i => Date.parse(i.createdAt ?? '') || 0)
  const fmt = (t: number | null) => (t === null ? 'not shrinking' : `~${clock(t, now)}`)
  const p0Text = count(0) ? `P0 done ${fmt(eta(count(0), p.closed.filter(p0).map(closedAt), created(all.filter(p0)), now))}` : 'no open P0'
  const allText = p.open.length ? `all open ${fmt(eta(p.open.length, p.closed.map(closedAt), created(all), now))}` : 'nothing open'
  const forecast: Row = { text: `Forecast: ${p0Text} · ${allText}`, tone: 'dim' }

  return {
    header, needsYou, pc,
    lanesHead: `LANES ${lanes.length}/${cap}`, starts, lanes: laneRows,
    prs: prRow, next, nextMore: Math.max(0, nextAll.length - 5),
    doneHead: `DONE last hour: ${hour.length}`, done, forecast,
    issues: { lanes: lanes.map(x => x.n), next: nextAll.slice(0, 5).map(i => i.number), done: closed.slice(0, 3).map(i => i.number), you: youShown.map(i => i.number) },
    youCount: p.questions + youShown.length,
    reviewCount: review.length,
  }
}

/** One short status-bar line. */
export function statusLine(pn: Panel): string {
  const usage = (pn.header[1]?.text ?? '').replace(/ \(goal \d+\)/, '').replace(/ at \S+/, '')
  return [pn.lanesHead.toLowerCase(), `PRs need review ${pn.reviewCount}`, pn.youCount ? `needs you ${pn.youCount}` : '', usage].filter(Boolean).join(' · ')
}

/** #305: a process call with no console window: pythonw (no console) -> quiet.py (CREATE_NO_WINDOW child). */
export const quietArgv = (argv: string[]): string[] =>
  ['C:/Users/97254/miniforge3/pythonw.exe', 'C:/work/Oren_study/a/tools/runner/quiet.py', ...argv]
