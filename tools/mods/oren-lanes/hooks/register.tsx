import type { Register } from 'claude-code'

import type { OrenLanesData } from '../types/index'
import {
  finishedRuns, groupIssues, isLive, parseWindows, statusLine, trunc, usageText,
} from './lanes'
import type { Issue, Win } from './lanes'

const PANE = 'oren-lanes'
const HC = 'C:/Users/97254/AppData/Local/Programs/herdr-core/hc.exe'
const REPO = 'igalgerman/oren_study'
const LOG = 'C:/work/Oren_study/a/tools/runner/.runs/runner.log'
const ROOT = /^c:[\\/]+work[\\/]+oren_study([\\/]|$)/i
const DATA = { plugin: 'oren-lanes', key: 'data' } as const
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

        let usage = ''
        try { usage = usageText(((await $.session.usage()).rateLimits ?? []) as any) } catch { /* no reading */ }

        const prev = (await $.state.get(LIVE)).value ?? []
        const hcOk = !errors.some(x => x.startsWith('windows'))
        if (hcOk) {
          for (const n of finishedRuns(prev, windows)) $.ui.toast(`${n} finished`)
          await $.state.set(LIVE, windows.filter(isLive).map(w => w.name))
        }
        const data: OrenLanesData = {
          windows, groups: groupIssues(issues), lastLog, errors, usage,
          updatedAt: await $.clock.now(),
        }
        await $.state.set(DATA, data)
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
    const d = (await $.state.get(DATA)).value
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
        {d && <Text bold>Windows</Text>}
        {d && d.windows.length === 0 && <Text dimColor>none</Text>}
        {d && d.windows.map(w => <Text>{trunc(`${w.name} · ${w.state}`, width)}</Text>)}
        {d && groups.map(([label, k]) => (
          <Box flexDirection="column">
            <Text bold>{label} {d.groups[k].count}</Text>
            {d.groups[k].titles.slice(0, 5).map(t => <Text dimColor>{trunc(t, width)}</Text>)}
          </Box>
        ))}
        {d && d.usage ? <Text>{'usage: ' + d.usage}</Text> : null}
        {d && d.lastLog !== '' && <Text dimColor>{trunc(d.lastLog, width)}</Text>}
      </Box>
    )
  })
}
