import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { OrenLanesData } from '../types/index'
import {
  finishedRuns, groupIssues, isLive, parseWindows, statusLine, trunc, usageText, flowRows, laneReasons, view, statsLines, parseMaxCore, parseLocalLanes, parseRemoteLanes, cloudRows, isCloud, remoteFromStats, needsRows,
} from './lanes'
import type { CloudLane, Issue, Needs, View, Win } from './lanes'

const PANE = 'oren-lanes'
const HC = 'C:/Users/97254/AppData/Local/Programs/herdr-core/hc.exe'
const REPO = 'igalgerman/oren_study'
const LOG = 'C:/work/Oren_study/a/tools/runner/.runs/runner.log'
const OBSERVER = 'C:/work/Oren_study/a/tools/runner/.runs/observer.last'
const CONFIG = 'C:/work/Oren_study/a/tools/runner/config.toml'
const STATS = 'C:/work/Oren_study/a/tools/runner/.runs/stats.jsonl'
const PY = 'C:\\Users\\97254\\miniforge3\\python.exe'
const REMOTE = 'C:/work/Oren_study/a/tools/runner/remote.py'
const OWNER_Q = 'C:/work/Oren_study/a/tools/runner/owner_q.py'
const ROOT = /^c:[\\/]+work[\\/]+oren_study([\\/]|$)/i
const DATA = { plugin: 'oren-lanes', key: 'data' } as const
// an atom, so every refresh REDRAWS the pane (a plain $.state.get in render did not subscribe)
const dataAtom = atom(DATA, null as OrenLanesData | null, { shape: 'data-2' })
const LIVE = { plugin: 'oren-lanes', key: 'live' } as const

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined
  let busy = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lanes', description: 'Open the Oren lanes pane' })
    if (ROOT.test(e.cwd)) void $.ui.open({ id: PANE, title: 'Oren lanes' })

    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const errors: string[] = []
        let windows: Win[] = []
        let issues: Issue[] = []
        let lastLog = ''
        try {
          const r = await $.process.run([HC, 'ls', '--json'], { timeoutMs: 10000 })
          if (r.exitCode !== 0) throw new Error(`hc exit ${r.exitCode}`)
          windows = parseWindows(r.stdout)
          // guard: the watchdog must always run — start it again if its window is gone
          // (`hc ls` lists live terminals only)
          if (!/"name":\s*"watchdog"/.test(r.stdout)) {
            await $.process.run([HC, 'run', '--bg', '--no-parent', '--outlive-parent', '--name', 'watchdog',
              '--cwd', 'C:\\work\\Oren_study\\a', 'C:\\Users\\97254\\miniforge3\\python.exe', 'tools\\runner\\watchdog.py'], { timeoutMs: 15000 })
            $.ui.toast('watchdog restarted')
          }
        } catch (err) {
          errors.push(`windows unavailable: ${trunc(String(err), 60)}`)
        }
        try {
          const r = await $.process.run(
            ['gh', 'issue', 'list', '-R', REPO, '--state', 'open', '--limit', '100',
              '--json', 'number,title,labels,body'],
            { timeoutMs: 90000 },
          )
          if (r.exitCode !== 0) throw new Error(trunc(r.stderr.trim() || `gh exit ${r.exitCode}`, 60))
          issues = JSON.parse(r.stdout) as Issue[]
        } catch (err) {
          errors.push(`backlog unavailable: ${trunc(String(err), 60)}`)
        }
        try {
          const text = (await $.fs.read(LOG)) as string
          lastLog = text.split('\n').map(s => s.trim()).filter(Boolean).pop() ?? ''
        } catch {
          // no runner log: nothing to show
        }

        let stats: string[] = []
        let remote: number[] = []
        try { const t = (await $.fs.read(STATS)) as string; stats = statsLines(t, Date.now() / 1000); remote = remoteFromStats(t) } catch { /* no stats yet */ }
        let observer = ''
        try { observer = ((await $.fs.read(OBSERVER)) as string).trim() } catch { /* no observer run yet */ }
        let maxCore = 1
        let localMax = 3, remoteMax = 0
        try { const t = (await $.fs.read(CONFIG)) as string; maxCore = parseMaxCore(t); localMax = parseLocalLanes(t); remoteMax = parseRemoteLanes(t) } catch { /* defaults */ }
        // started remote by the runner and still running (a later local start overrides: remoteFromStats keeps the last start)
        remote = remote.filter(n => issues.some(i => i.number === n && (i.labels ?? []).some(x => x.name === 'in-progress')))
        let cloud: string[] = []
        try {   // #136: one row per cloud lane, state from tools/runner/remote.py
          const extra = remote.map(String)
          const r = await $.process.run([PY, REMOTE, 'cloud', ...extra], { timeoutMs: 120000 })
          if (r.exitCode !== 0) throw new Error(`remote.py exit ${r.exitCode}`)
          cloud = cloudRows(JSON.parse(r.stdout) as CloudLane[])
        } catch (err) {
          errors.push(`cloud lanes unavailable: ${trunc(String(err), 60)}`)
        }
        let needs: string[] = []
        try {   // #136: open owner questions (#205) + blocked / ready-for-human / needs-info issues with their reason
          const r = await $.process.run([PY, OWNER_Q, 'needs'], { timeoutMs: 120000 })
          if (r.exitCode !== 0) throw new Error(`owner_q.py exit ${r.exitCode}`)
          needs = needsRows(JSON.parse(r.stdout) as Needs)
        } catch (err) {
          errors.push(`needs-you list unavailable: ${trunc(String(err), 60)}`)
        }
        let flow: string[] = []
        let vw: View | undefined
        let done = ''
        try {
          const pr = await $.process.run(['gh', 'pr', 'list', '-R', REPO, '--state', 'open', '--json', 'headRefName'], { timeoutMs: 90000 })
          const cl = await $.process.run(['gh', 'issue', 'list', '-R', REPO, '--state', 'closed', '--limit', '300', '--json', 'number,title,labels,closedAt'], { timeoutMs: 90000 })
          const prs = pr.exitCode === 0 ? (JSON.parse(pr.stdout) as { headRefName: string }[]).map(p => p.headRefName) : []
          const closed = cl.exitCode === 0 ? (JSON.parse(cl.stdout) as Issue[]) : []
          flow = flowRows(issues, closed, windows, prs)
          vw = view(issues, closed, windows, prs, localMax, maxCore, remote)
          const dayAgo = Date.now() - 24 * 3600 * 1000
          const today = closed.filter(c => Date.parse((c as { closedAt?: string }).closedAt ?? '') > dayAgo).length
          const g = groupIssues(issues)
          const agentWork = g.running.count + g.ready.count + g.waiting.count
          done = `backlog ${closed.length}/${closed.length + issues.length} done · ${today} in 24h · left ${issues.length}: ${g.running.count} running, ${g.ready.count} ready, ${g.waiting.count} waiting, ${g.needsYou.count + g.triage.count} need you`
            + (agentWork <= 1 ? ' · ⚠ almost no work for the lanes — add to the backlog (/idea, /task)' : '')
        } catch { /* flow is optional */ }
        let usage = ''
        try { usage = usageText(((await $.session.usage()).rateLimits ?? []) as any) } catch { /* no reading */ }

        const prev = (await $.state.get(LIVE)).value ?? []
        const hcOk = !errors.some(x => x.startsWith('windows'))
        if (hcOk) {
          for (const n of finishedRuns(prev, windows)) $.ui.toast(`${n} finished`)
          await $.state.set(LIVE, windows.filter(isLive).map(w => w.name))
        }
        // GitHub slow or offline: keep showing the last good backlog instead of an empty panel
        const prevData = await read($, dataAtom)
        const ghFailed = errors.some(x => x.startsWith('backlog'))
        const data: OrenLanesData = ghFailed && prevData ? {
          ...prevData, windows, usage, stats, observer, lastLog, localMax, remoteMax,
          errors: [`GitHub slow — showing data from ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(prevData.updatedAt))}`],
          updatedAt: prevData.updatedAt,
        } : {
          windows, groups: groupIssues(issues), lastLog, errors, usage, flow, done, lanes: laneReasons(issues, windows, 3, maxCore), view: vw, stats, observer,
          localMax, remoteMax, cloudCount: issues.filter(i => isCloud(i) || remote.includes(i.number)).length, cloud, needs,
          updatedAt: await $.clock.now(),
        }
        await update($, dataAtom, () => data)
        $.ui.status(statusLine(data))
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
    const line = (s: string) => <Text>{trunc(s, width)}</Text>
    const dim = (s: string) => <Text dimColor>{trunc(s, width)}</Text>
    const head = (s: string) => <Box marginTop={1}><Text bold>{s}</Text></Box>
    if (!d) return <Text dimColor>Loading…</Text>
    const v = d.view
    const summary = (d.done ?? '').replace(/ · left .*/, '').replace(/^backlog /, 'Backlog ')
    return (
      <Box flexDirection="column">
        <Text bold>NEEDS YOU / BLOCKED</Text>
        {(d.needs ?? []).length ? (d.needs ?? []).map(s => s.startsWith('   ') ? <Text dimColor>{s}</Text>
          : <Text color={s.startsWith('⛔') ? 'red' : 'yellow'}>{trunc(s, width)}</Text>) : dim('nothing waits for you')}
        <Box marginTop={1}><Text bold>{trunc(summary || 'Backlog …', width)}</Text></Box>
        {d.usage ? dim('Usage ' + d.usage) : null}
        {(d.done ?? '').includes('⚠') ? <Text color="yellow">{trunc('⚠ Lanes running out of work — add to the backlog (/idea, /task)', width)}</Text> : null}
        {d.errors.map(dim)}
        {head('LANES')}
        {v && v.lanes.map(line)}
        {(d.cloud ?? []).map(s => s.startsWith('   ') ? <Text dimColor>{s}</Text> : s.includes(' · STALE') ? <Text color="red">{trunc(s, width)}</Text> : line(s))}
        {v && v.next.length > 0 && head('UP NEXT')}
        {v && v.next.slice(0, 6).map(dim)}
        {v && v.next.length > 6 ? dim(`… and ${v.next.length - 6} more`) : null}
        {v && v.done.length > 0 && head('DONE')}
        {v && v.done.map(dim)}
        {(() => { const s = (d.stats ?? []).filter(x => !/^merged /.test(x) && !/ -$/.test(x.trim())); return s.length ? [head('STEP TIMES'), ...s.slice(0, 2).map(dim)] : null })()}
        {d.observer ? dim('observer: ' + d.observer) : null}
        <Box marginTop={1}><Button key="refresh" label="Refresh" onPress={() => void refreshRef()} /></Box>
        {dim('updated ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(d.updatedAt)) + ' · every 30 s')}
      </Box>
    )
  })
}
