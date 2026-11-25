import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { OrenLanesData } from '../types/index'
import {
  finishedRuns, groupIssues, isLive, parseWindows, statusLine, trunc, usageText, flowRows, laneReasons, statsLines,
} from './lanes'
import type { Issue, Win } from './lanes'

const PANE = 'oren-lanes'
const HC = 'C:/Users/97254/AppData/Local/Programs/herdr-core/hc.exe'
const REPO = 'igalgerman/oren_study'
const LOG = 'C:/work/Oren_study/a/tools/runner/.runs/runner.log'
const STATS = 'C:/work/Oren_study/a/tools/runner/.runs/stats.jsonl'
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
            { timeoutMs: 20000 },
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
        try { stats = statsLines((await $.fs.read(STATS)) as string, Date.now() / 1000) } catch { /* no stats yet */ }
        let flow: string[] = []
        let done = ''
        try {
          const pr = await $.process.run(['gh', 'pr', 'list', '-R', REPO, '--state', 'open', '--json', 'headRefName'], { timeoutMs: 20000 })
          const cl = await $.process.run(['gh', 'issue', 'list', '-R', REPO, '--state', 'closed', '--limit', '500', '--json', 'number,title,labels,body,closedAt'], { timeoutMs: 20000 })
          const prs = pr.exitCode === 0 ? (JSON.parse(pr.stdout) as { headRefName: string }[]).map(p => p.headRefName) : []
          const closed = cl.exitCode === 0 ? (JSON.parse(cl.stdout) as Issue[]) : []
          flow = flowRows(issues, closed, windows, prs)
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
        const data: OrenLanesData = {
          windows, groups: groupIssues(issues), lastLog, errors, usage, flow, done, lanes: laneReasons(issues, windows), stats,
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
    const groups: [string, keyof OrenLanesData['groups']][] = [
      ['Running', 'running'], ['Ready', 'ready'], ['Waiting', 'waiting'],
      ['Blocked', 'blocked'], ['Needs you', 'needsYou'], ['Triage', 'triage'],
    ]
    return (
      <Box flexDirection="column">
        <Button key="refresh" label="Refresh" onPress={() => void refreshRef()} />
        {!d && <Text dimColor>Loading...</Text>}
        {d && d.errors.map(x => <Text dimColor>{trunc(x, width)}</Text>)}
        {d && d.lanes && <Text bold>Lanes</Text>}
        {d && d.lanes && d.lanes.map(x => <Text>{trunc(x, width)}</Text>)}
        {d && d.flow && d.flow.length > 0 && <Text bold>Flow  (Plan → Build → Review → Merge+tests → Live)</Text>}
        {d && d.flow && d.flow.map(x => <Text>{trunc(x, width)}</Text>)}
        {d && <Text bold>Windows</Text>}
        {d && d.windows.length === 0 && <Text dimColor>none</Text>}
        {d && d.windows.map(w => <Text>{trunc(`${w.name} · ${w.state}`, width)}</Text>)}
        {d && groups.map(([label, k]) => (
          <Box flexDirection="column">
            <Text bold>{label} {d.groups[k].count}</Text>
            {d.groups[k].titles.slice(0, 5).map(t => <Text dimColor>{trunc(t, width)}</Text>)}
          </Box>
        ))}
        {d && d.done ? <Text bold>{d.done}</Text> : null}
        {d && d.stats && d.stats.length > 0 && <Text bold>Stats</Text>}
        {d && d.stats && d.stats.map(x => <Text dimColor>{trunc(x, width)}</Text>)}
        {d && d.usage ? <Text>{'usage: ' + d.usage}</Text> : null}
        {d && d.lastLog !== '' && <Text dimColor>{trunc(d.lastLog, width)}</Text>}
      </Box>
    )
  })
}
