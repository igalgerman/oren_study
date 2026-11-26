/** One panel line; tone red = stuck/blocked or owner needed, amber = waits > 30 min or off pace. */
export type Row = { text: string; tone: 'red' | 'amber' | 'dim' | '' }

/** #296: the panel, top = most important. */
export type Panel = {
  header: Row[]
  needsYou: Row | null
  pc: Row | null
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
