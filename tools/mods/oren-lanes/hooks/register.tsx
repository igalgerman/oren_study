import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { OrenLanesData, Row } from '../types/index'
import {
  finishedRuns, isLive, parseWindows, statusLine, trunc, usageJson, parseGov, parseConfig, parseEvents, panel,
} from './lanes'
import type { CloudLane, Gov, Issue, Limit, Pr, Win } from './lanes'

const PANE = 'oren-lanes'
const HC = 'C:/Users/97254/AppData/Local/Programs/herdr-core/hc.exe'
const REPO = 'igalgerman/oren_study'
const RUNS = 'C:/work/Oren_study/a/tools/runner/.runs'
const CONFIG = 'C:/work/Oren_study/a/tools/runner/config.toml'
const PY = 'C:\\Users\\97254\\miniforge3\\python.exe'
const REMOTE = 'C:/work/Oren_study/a/tools/runner/remote.py'
const OWNER_Q = 'C:/work/Oren_study/a/tools/runner/owner_q.py'
const ROOT = /^c:[\\/]+work[\\/]+oren_study([\\/]|$)/i
const DATA = { plugin: 'oren-lanes', key: 'data' } as const
// an atom, so every refresh REDRAWS the pane (a plain $.state.get in render did not subscribe)
const dataAtom = atom(DATA, null as OrenLanesData | null, { shape: 'data-3' })
const LIVE = { plugin: 'oren-lanes', key: 'live' } as const
const PR_FIELDS = 'number,headRefName,createdAt,isDraft,mergeable,autoMergeRequest,closingIssuesReferences,statusCheckRollup'

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined
  let busy = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lanes', description: 'Open the Oren lanes pane' })
    if (ROOT.test(e.cwd)) void $.ui.open({ id: PANE, title: 'Oren lanes' })

    const readText = async (p: string) => { try { return (await $.fs.read(p)) as string } catch { return '' } }
    const json = async <T,>(argv: string[], what: string, errors: string[]): Promise<T | null> => {
      try {
        const r = await $.process.run(argv, { timeoutMs: 90000 })
        if (r.exitCode !== 0) throw new Error(trunc(r.stderr.trim() || `exit ${r.exitCode}`, 60))
        return JSON.parse(r.stdout) as T
      } catch (err) { errors.push(`${what} unavailable: ${trunc(String(err), 60)}`); return null }
    }

    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const errors: string[] = []
        let windows: Win[] = []
        try {
          const r = await $.process.run([HC, 'ls', '--json'], { timeoutMs: 10000 })
          if (r.exitCode !== 0) throw new Error(`hc exit ${r.exitCode}`)
          windows = parseWindows(r.stdout)
          // guard: the watchdog must always run — start it again if its window is gone
          // (`hc ls` lists live terminals only)
          if (!/"name":\s*"watchdog"/.test(r.stdout)) {
            await $.process.run([HC, 'run', '--bg', '--no-parent', '--outlive-parent', '--name', 'watchdog',
              '--cwd', 'C:\\work\\Oren_study\\a', PY, 'tools\\runner\\watchdog.py'], { timeoutMs: 15000 })
            $.ui.toast('watchdog restarted')
          }
        } catch (err) {
          errors.push(`windows unavailable: ${trunc(String(err), 60)}`)
        }
        const open = await json<Issue[]>(['gh', 'issue', 'list', '-R', REPO, '--state', 'open', '--limit', '200', '--json', 'number,title,labels,body,createdAt'], 'backlog', errors)
        const closed = (await json<Issue[]>(['gh', 'issue', 'list', '-R', REPO, '--state', 'closed', '--limit', '300', '--json', 'number,title,labels,createdAt,closedAt'], 'closed issues', errors)) ?? []
        const prs = (await json<Pr[]>(['gh', 'pr', 'list', '-R', REPO, '--state', 'open', '--json', PR_FIELDS], 'PRs', errors)) ?? []
        const cloud = (await json<CloudLane[]>([PY, REMOTE, 'cloud'], 'cloud lanes', errors)) ?? []   // #136

        let questions = 0
        try {   // #193: open owner questions (the pinned 'Questions for the owner' issue)
          const r = await $.process.run([PY, OWNER_Q, 'open'], { timeoutMs: 60000 })
          if (r.exitCode !== 0) throw new Error(`owner_q exit ${r.exitCode}`)
          questions = r.stdout.split('\n').filter(l => /^[0-9a-f]{12}\s/.test(l)).length
        } catch (err) { errors.push(`owner questions unavailable: ${trunc(String(err), 50)}`) }
        let questionIssue: number | undefined
        try { questionIssue = JSON.parse(await readText(`${RUNS}/owner_q.json`)).issue || undefined } catch { /* none yet */ }

        let limits: Limit[] = []
        try {
          limits = ((await $.session.usage()).rateLimits ?? []) as any
          const u = usageJson(limits, await $.clock.now())
          if (u) await $.fs.write(`${RUNS}/usage.json`, JSON.stringify(u))   // #239: read by the runner's usage governor
        } catch { /* no reading */ }

        const where: Record<number, string> = {}
        for (const i of open ?? []) {
          if ((i.labels ?? []).some(l => l.name === 'in-progress')) where[i.number] = (await readText(`${RUNS}/${i.number}/where`)).trim()
        }
        let pc: { text: string; alarm?: boolean } | null = null
        try { pc = JSON.parse(await readText(`${RUNS}/pc.json`)) } catch { /* #293 not there yet */ }
        let refusedAt: number | undefined
        try { refusedAt = JSON.parse(await readText(`${RUNS}/remote_refused.json`)).at } catch { /* no refusal */ }

        const prev = (await $.state.get(LIVE)).value ?? []
        if (!errors.some(x => x.startsWith('windows'))) {
          for (const n of finishedRuns(prev, windows)) $.ui.toast(`${n} finished`)
          await $.state.set(LIVE, windows.filter(isLive).map(w => w.name))
        }
        // GitHub slow or offline: keep showing the last good panel instead of an empty one
        const prevData = await read($, dataAtom)
        const now = await $.clock.now()
        const data: OrenLanesData = !open && prevData?.panel ? {
          ...prevData,
          errors: [`GitHub slow — showing data from ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(prevData.updatedAt))}`],
        } : {
          panel: panel({
            now, open: open ?? [], closed, prs, wins: windows, cloud, events: parseEvents(await readText(`${RUNS}/stats.jsonl`)), where,
            gov: parseGov(await readText(`${RUNS}/governor.json`)) as Gov | null, limits, questions, questionIssue, pc, refusedAt,
            cfg: parseConfig(await readText(CONFIG)),
          }),
          errors, updatedAt: now,
        }
        await update($, dataAtom, () => data)
        if (data.panel) $.ui.status(statusLine(data.panel))
      } catch (err) {
        $.ui.log(`oren-lanes: ${String(err)}`, { to: 'debug' })
      } finally {
        busy = false
      }
    }

    timer?.cancel()
    timer = $.clock.every(30000, () => { void refresh() })
    void refresh()
    refreshRef = refresh

    return next(e)
  })

  let refreshRef: () => Promise<void> = async () => {}

  on('command.run', { command: 'lanes' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Oren lanes' })
    void refreshRef()
    return { text: 'Oren lanes pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, dataAtom)
    const width = Math.max(20, (e.props.bodyColumns ?? 40) - 2)
    const color = { red: 'red', amber: 'yellow' } as Record<string, string>
    const row = (r: Row, bold = false) => <Text color={color[r.tone]} dimColor={r.tone === 'dim'} bold={bold}>{trunc(r.text, width)}</Text>
    const head = (s: string) => <Box marginTop={1}><Text bold>{trunc(s, width)}</Text></Box>
    if (!d?.panel) return <Text dimColor>Loading…</Text>
    const p = d.panel
    return (
      <Box flexDirection="column">
        {p.header.map((r, k) => row(r, k === 0))}
        {p.needsYou ? row(p.needsYou, true) : null}
        {p.pc ? row(p.pc) : null}
        {d.errors.map(s => row({ text: s, tone: 'dim' }))}
        {head(p.lanesHead)}
        {row(p.starts)}
        {p.lanes.map(r => row(r))}
        <Box marginTop={1}>{row(p.prs)}</Box>
        {p.next.length > 0 && head('UP NEXT')}
        {p.next.map(r => row(r))}
        {p.nextMore > 0 ? row({ text: `… and ${p.nextMore} more`, tone: 'dim' }) : null}
        {head(p.doneHead)}
        {p.done.map(r => row(r))}
        <Box marginTop={1}>{row(p.forecast)}</Box>
        <Box marginTop={1}><Button key="refresh" label="Refresh" onPress={() => void refreshRef()} /></Box>
        {row({ text: 'updated ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(d.updatedAt)) + ' · every 30 s', tone: 'dim' })}
      </Box>
    )
  })
}
