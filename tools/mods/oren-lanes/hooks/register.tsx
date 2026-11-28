import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { OrenLanesData, Row } from '../types/index'
import {
  finishedRuns, isLive, parseWindows, statusLine, trunc, usageJson, planJson, parseGov, parseConfig, parseEvents, panel, quietArgv, fromCache, modeRecord, GH_CACHE,
} from './lanes'
import type { CloudLane, Gov, Issue, Limit, Pr, Win } from './lanes'

const PANE = 'oren-lanes'
const HC = 'C:/Users/97254/AppData/Local/Programs/herdr-core/hc.exe'
const RUNS = 'C:/work/Oren_study/a/tools/runner/.runs'
const CONFIG = 'C:/work/Oren_study/a/tools/runner/config.toml'
const PY = 'C:\\Users\\97254\\miniforge3\\python.exe'
const REMOTE = 'C:/work/Oren_study/a/tools/runner/remote.py'
const OWNER_Q = 'C:/work/Oren_study/a/tools/runner/owner_q.py'
// $.process.run has no hide-window option: every call goes through pythonw (no console) -> quiet.py (CREATE_NO_WINDOW child)
const quietRun = ($: { process: { run: (argv: string[], init?: any) => Promise<any> } }, argv: string[], init?: any) =>
  $.process.run(quietArgv(argv), init)
// the checkout folder, derived from CONFIG (#792: no repo/folder name hardcoded here)
const ROOT = new RegExp('^' + CONFIG.replace(/[\\/]+a[\\/]+tools[\\/].*$/i, '').split(/[\\/]+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]+') + '([\\\\/]|$)', 'i')
const DATA = { plugin: 'oren-lanes', key: 'data' } as const
// an atom, so every refresh REDRAWS the pane (a plain $.state.get in render did not subscribe)
const dataAtom = atom(DATA, null as OrenLanesData | null, { shape: 'data-3' })
const LIVE = { plugin: 'oren-lanes', key: 'live' } as const

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined
  let busy = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lanes', description: 'Open the Oren lanes pane' })
    if (ROOT.test(e.cwd)) void $.ui.open({ id: PANE, title: 'Oren lanes' })

    const readText = async (p: string) => { try { return (await $.fs.read(p)) as string } catch { return '' } }
    const json = async <T,>(argv: string[], what: string, errors: string[]): Promise<T | null> => {
      try {
        const r = await quietRun($, argv, { timeoutMs: 90000 })
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
          const r = await quietRun($, [HC, 'ls', '--json'], { timeoutMs: 10000 })
          if (r.exitCode !== 0) throw new Error(`hc exit ${r.exitCode}`)
          windows = parseWindows(r.stdout)
          // guard: the watchdog must always run — start it again if its window is gone
          // (`hc ls` lists live terminals only)
          if (!/"name":\s*"watchdog"/.test(r.stdout)) {
            await quietRun($, [HC, 'run', '--bg', '--no-parent', '--outlive-parent', '--name', 'watchdog',
              '--cwd', 'C:\\work\\Oren_study\\a', PY, 'tools\\runner\\watchdog.py'], { timeoutMs: 15000 })
            $.ui.toast('watchdog restarted')
          }
        } catch (err) {
          errors.push(`windows unavailable: ${trunc(String(err), 60)}`)
        }
        let open: Issue[] | null = null
        let closed: Issue[] = []
        let prs: Pr[] = []
        try {   // #329: GitHub only from the shared cache (the watchdog reads it once a minute); no gh call here
          const gh = fromCache(await readText(GH_CACHE), await $.clock.now())
          open = gh.issues; closed = gh.closed; prs = gh.prs
        } catch (err) { errors.push(`backlog unavailable: ${trunc(String(err), 60)}`) }
        const cloud = (await json<CloudLane[]>([PY, REMOTE, 'cloud'], 'cloud lanes', errors)) ?? []   // #136 (remote.py reads through the same cache)

        let questions = 0
        try {   // #193: open owner questions (the pinned 'Questions for the owner' issue)
          const r = await quietRun($, [PY, OWNER_Q, 'open'], { timeoutMs: 60000 })
          if (r.exitCode !== 0) throw new Error(`owner_q exit ${r.exitCode}`)
          questions = r.stdout.split('\n').filter(l => /^[0-9a-f]{12}\s/.test(l)).length
        } catch (err) { errors.push(`owner questions unavailable: ${trunc(String(err), 50)}`) }
        let questionIssue: number | undefined
        try { questionIssue = JSON.parse(await readText(`${RUNS}/owner_q.json`)).issue || undefined } catch { /* none yet */ }

        let limits: Limit[] = []
        try {
          limits = ((await $.session.usage()).rateLimits ?? []) as any
          let prevU = null
          try { prevU = JSON.parse(await readText(`${RUNS}/usage.json`)) } catch { /* first write */ }
          const u = usageJson(limits, await $.clock.now(), prevU)
          if (u) await $.fs.write(`${RUNS}/usage.json`, JSON.stringify(u))   // #239/#706: read by the runner's usage governor
        } catch { /* no reading */ }
        try {   // #706: the plan label once a day; only subscriptionType is kept
          let last = 0
          try { last = Date.parse(JSON.parse(await readText(`${RUNS}/plan.json`)).at) || 0 } catch { /* none yet */ }
          if ((await $.clock.now()) - last > 24 * 3600e3) {
            const r = await quietRun($, ['claude', 'auth', 'status'], { timeoutMs: 30000 })
            const pj = r.exitCode === 0 ? planJson(r.stdout, await $.clock.now()) : null
            if (pj) await $.fs.write(`${RUNS}/plan.json`, JSON.stringify(pj))
          }
        } catch { /* no plan read */ }

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
            gov: parseGov(await readText(`${RUNS}/governor.json`)) as Gov | null, limits, questions, questionIssue, pc, refusedAt, desks: parseGov(await readText(`${RUNS}/desks.json`))?.text ?? '',   // #306
            canary: [parseGov(await readText(`${RUNS}/progress_alarm.json`))?.text, parseGov(await readText(`${RUNS}/canary.json`))?.text].filter(Boolean).join(' · '),   // #330 + #891 (no-progress alarm)
            control: parseGov(await readText(`${RUNS}/control_health.json`))?.text ?? '',   // #890
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
    timer = $.clock.every(60000, () => { void refresh() })   // #329: 60 s, from the cache only
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
        {p.desks ? row(p.desks) : null}
        {p.canary ? row(p.canary) : null}
        {p.control ? row(p.control) : null}
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
        <Box marginTop={1}>{row(p.mode)}</Box>
        <Box><Button key="mode" label={`Mode → ${p.modeNext}`} onPress={async () => { await $.fs.write(`${RUNS}/override.json`, JSON.stringify(modeRecord(p.modeNext, Date.now() / 1000))); void refreshRef() }} /></Box>
        <Box marginTop={1}><Button key="refresh" label="Refresh" onPress={() => void refreshRef()} /></Box>
        {row({ text: 'updated ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(d.updatedAt)) + ' · every 30 s', tone: 'dim' })}
      </Box>
    )
  })
}
