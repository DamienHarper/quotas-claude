export type Quota = { kind: string; percentUsed: number; resetsAt?: string }

export type Meter = {
  quotas: Quota[]
  costUsd?: number
}

export type Mode = 'reduite' | 'complete' | 'masquee'

/** Fenêtre mise en grand dans la version complète : choisie, ou la plus serrée (`auto`). */
export type Focus = 'auto' | 'five_hour' | 'seven_day'

declare module 'claude-code' {
  interface PluginState {
    'quotas-claude': { meter: Shaped<Meter>; now: number; mode: Mode; focus: Focus }
  }
}
