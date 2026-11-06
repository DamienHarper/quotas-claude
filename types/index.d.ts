export type Quota = { kind: string; percentUsed: number; resetsAt?: string }

export type Meter = {
  quotas: Quota[]
  costUsd?: number
}

export type Mode = 'reduite' | 'complete' | 'masquee'

declare module 'claude-code' {
  interface PluginState {
    'quotas-claude': { meter: Shaped<Meter>; now: number; mode: Mode }
  }
}
