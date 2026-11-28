/** One panel line; tone red = stuck/blocked or owner needed, amber = waits > 30 min or off pace. */
export type Row = { text: string; tone: 'red' | 'amber' | 'dim' | '' }

/** #296: the panel, top = most important. */
export type Panel = {
  header: Row[]
  needsYou: Row | null
  pc: Row | null
  desks: Row | null   // #306: 'cloud desks: inbox ok · ask down' (red when down)
  mode: Row           // #712: 'mode: FAST until 14:05' / 'mode: normal'
  modeNext: 'fast' | 'save' | 'normal'   // #712: what the Mode button sets next
  canary: Row | null  // #330: 'flow ok HH:MM' or NEEDS-ATTENTION ... (red)
  lanesHead: string
  starts: Row
  lanes: Row[]
  prs: Row
  next: Row[]
  nextMore: number
  doneHead: string
  done: Row[]
  forecast: Row
  issues: { lanes: number[]; next: number[]; done: number[]; you: number[] }
  youCount: number
  reviewCount: number
}

export type OrenLanesWindow = { name: string; state: string }
export type OrenLanesData = {
  panel: Panel | null
  errors: string[]
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'oren-lanes': {
      data: OrenLanesData | null
      live: string[]
    }
  }
}
