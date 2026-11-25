export type OrenLanesWindow = { name: string; state: string }
export type OrenLanesGroup = { count: number; titles: string[] }
export type OrenLanesData = {
  windows: OrenLanesWindow[]
  groups: {
    running: OrenLanesGroup
    ready: OrenLanesGroup
    waiting: OrenLanesGroup
    blocked: OrenLanesGroup
    needsYou: OrenLanesGroup
    triage: OrenLanesGroup
  }
  lastLog: string
  usage?: string
  flow?: string[]
  done?: string
  lanes?: string[]
  view?: { lanes: string[]; you: string[]; next: string[]; done: string[] }
  stats?: string[]
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
