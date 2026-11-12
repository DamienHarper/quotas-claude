import { atom, read, update } from 'claude-code'
import type { Register, SessionCost, SessionRateLimit } from 'claude-code'

import type { Focus, Meter, Mode, Quota } from '../types'

const HOUR = 3_600_000
const DURATION: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 168 * HOUR }
const LABEL: Record<string, string> = { five_hour: 'Fenêtre 5 h', seven_day: 'Semaine' }
const SHORT: Record<string, string> = { five_hour: '5h', seven_day: '7j' }

const meter = atom({ plugin: 'quotas-claude', key: 'meter' } as const, { quotas: [] }, { shape: 'meter-1' })
const now = atom({ plugin: 'quotas-claude', key: 'now' } as const, 0)
const mode = atom({ plugin: 'quotas-claude', key: 'mode' } as const, 'reduite')
const focus = atom({ plugin: 'quotas-claude', key: 'focus' } as const, 'auto')

/*
 * Deux palettes, choisies par le thème de l'app (`prefers-color-scheme`) dans le
 * SVG lui-même : chaque élément porte une classe `f-<couleur>` (remplissage) ou
 * `s-<couleur>` (trait), résolue par la feuille de style embarquée.
 */
const PALETTE = {
  light: {
    card: '#ffffff', edge: '#e2e0da', panel: '#f3f2ee', pill: '#ebe9e4', track: '#d9d7d0',
    text: '#1f1f1d', muted: '#6b6a64', ink: '#ffffff',
    green: '#2e8b3a', amber: '#b07a0a', red: '#c93a30', blue: '#2f6fd6',
  },
  dark: {
    card: '#262624', edge: '#262624', panel: '#30302e', pill: '#393936', track: '#4a4a46',
    text: '#ecebe6', muted: '#a3a29b', ink: '#1f1f1d',
    green: '#4cc35a', amber: '#e0a526', red: '#f2564b', blue: '#5aa2ff',
  },
}
type Tone = keyof typeof PALETTE.light
const C = Object.fromEntries(Object.keys(PALETTE.light).map(k => [k, k])) as { [K in Tone]: K }

const rules = (p: Record<Tone, string>): string =>
  (Object.keys(p) as Tone[]).map(k => `.f-${k}{fill:${p[k]}}.s-${k}{stroke:${p[k]}}`).join('')

const STYLE = `<style>${rules(PALETTE.light)}@media (prefers-color-scheme: dark){${rules(PALETTE.dark)}}</style>`

const SANS = '-apple-system, system-ui, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const W = 600

/* ---------- calculs ---------- */

type Reading = {
  quota: Quota
  untilReset?: number
  elapsed?: number
  delta?: number
}

const readQuota = (quota: Quota, at: number): Reading => {
  const total = DURATION[quota.kind]
  const resetsAt = quota.resetsAt ? Date.parse(quota.resetsAt) : NaN
  if (!total || Number.isNaN(resetsAt) || at === 0) return { quota }

  const untilReset = Math.max(0, resetsAt - at)
  const elapsed = Math.min(100, Math.max(0, ((total - untilReset) / total) * 100))

  return { quota, untilReset, elapsed, delta: elapsed - quota.percentUsed }
}

const usageColor = (percent: number): string => (percent >= 85 ? C.red : percent >= 60 ? C.amber : C.green)

const deltaColor = (delta: number | undefined, percent: number): string =>
  percent >= 100 ? C.red : delta === undefined ? usageColor(percent) : delta >= 0 ? C.green : delta >= -10 ? C.amber : C.red

const signed = (delta: number): string => `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace('.', ',')}`

const pad = (n: number): string => String(n).padStart(2, '0')

const duration = (ms: number): string => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  if (hours >= 24) return hours % 24 === 0 ? `${hours / 24} j` : `${Math.floor(hours / 24)} j ${hours % 24} h`
  if (hours > 0) return `${hours} h ${pad(minutes % 60)}`
  return `${minutes} min`
}

const compact = (ms: number): string => {
  const hours = ms / HOUR
  if (hours >= 24) return `${Math.round(hours / 24)}j`
  if (hours >= 1) return `${Math.floor(hours)}h`
  return `${Math.max(0, Math.round(ms / 60_000))}min`
}


/* ---------- dessin SVG ---------- */

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const text = (x: number, y: number, s: string, size: number, fill: string, extra = ''): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" class="f-${fill}" ${extra}>${esc(s)}</text>`

const rect = (x: number, y: number, w: number, h: number, r: number, fill: string, extra = ''): string =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h}" rx="${r}" class="f-${fill}" ${extra}/>`

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/* Largeurs approchées : sans ≈ 0,5 em, mono ≈ 0,6 em. */
const sansWidth = (s: string, size: number): number => s.length * size * 0.5
const monoWidth = (s: string, size: number): number => s.length * size * 0.6

const hero = (r: Reading, y: number): { svg: string; height: number } => {
  const q = r.quota
  const color = deltaColor(r.delta, q.percentUsed)
  const parts: string[] = []

  // Ligne du grand chiffre
  const big = r.delta === undefined ? `${Math.round(q.percentUsed)} %` : `${signed(r.delta)} %`
  const bigSize = 46
  parts.push(text(24, y + 48, big, bigSize, color, `font-family="${SANS}" font-weight="700"`))
  if (r.delta !== undefined) {
    const tag = r.delta >= 0 ? 'd’avance' : 'de retard'
    const tx = 24 + big.length * bigSize * 0.58 + 16
    const tw = sansWidth(tag, 15) + 24
    parts.push(rect(tx, y + 20, tw, 30, 8, color, 'fill-opacity="0.16"'))
    parts.push(text(tx + tw / 2, y + 40, tag, 15, color, `font-family="${SANS}" font-weight="500" text-anchor="middle"`))
  }
  const caption =
    r.untilReset === undefined ? LABEL[q.kind] ?? q.kind : `${LABEL[q.kind] ?? q.kind} · reset dans ${duration(r.untilReset)}`
  parts.push(text(W - 24, y + 42, caption, 13, C.muted, `font-family="${SANS}" text-anchor="end"`))

  // Panneau de la grande barre
  const py = y + 66
  const ph = 96
  parts.push(rect(16, py, W - 32, ph, 14, C.panel))
  const x1 = 72
  const x2 = W - 44
  const span = x2 - x1
  const by = py + 42
  const bh = 14
  parts.push(text(34, by + 12, SHORT[q.kind] ?? '', 15, C.muted, `font-family="${SANS}"`))
  parts.push(rect(x1, by, span, bh, 7, C.track))

  const ux = x1 + (clamp(q.percentUsed, 0, 100) / 100) * span
  parts.push(rect(x1, by, ux - x1, bh, 7, usageColor(q.percentUsed)))

  if (r.elapsed !== undefined) {
    const ex = x1 + (r.elapsed / 100) * span
    const from = Math.min(ux, ex)
    const to = Math.max(ux, ex)
    if (to - from > 1) {
      const zone = ex >= ux ? C.blue : C.red
      parts.push(
        rect(from, by - 4, to - from, bh + 8, 6, `${zone} s-${zone}`, 'fill-opacity="0.18" stroke-width="1.5"'),
      )
    }
    parts.push(rect(ex - 1.5, by - 9, 3, bh + 18, 1.5, C.text))

    const label = `Temps ${Math.round(r.elapsed)} %`
    const lw = label.length * 13 * 0.58 + 20
    const lx = clamp(ex - lw / 2, 22, W - 22 - lw)
    parts.push(rect(lx, py + 6, lw, 22, 6, C.text))
    parts.push(
      text(lx + lw / 2, py + 21, label, 13, C.ink, `font-family="${SANS}" font-weight="600" text-anchor="middle"`),
    )
  }

  const used = `Utilisé ${Math.round(q.percentUsed)} %`
  const uw = sansWidth(used, 14)
  const uxText = clamp(ux - uw / 2, x1, x2 - uw)
  parts.push(text(uxText, by + bh + 26, used, 14, usageColor(q.percentUsed), `font-family="${SANS}" font-weight="500"`))

  return { svg: parts.join(''), height: 66 + ph }
}

type Chunk = { width: number; draw: (x: number, y: number) => string }

const word = (s: string, fill: string, size = 13): Chunk => ({
  width: monoWidth(s, size),
  draw: (x, y) => text(x, y, s, size, fill, `font-family="${MONO}"`),
})

const BAR = 54

const mini = (percent: number, width = BAR): Chunk => ({
  width,
  draw: (x, y) =>
    rect(x, y - 8, width, 6, 3, C.track) + rect(x, y - 8, (clamp(percent, 0, 100) / 100) * width, 6, 3, usageColor(percent)),
})

const pill = (chunks: Chunk[]): Chunk => {
  const gap = 8
  const inner = chunks.reduce((sum, c) => sum + c.width, 0) + gap * (chunks.length - 1)
  const width = inner + 24
  return {
    width,
    draw: (x, y) => {
      let cx = x + 12
      const body = chunks.map(c => {
        const out = c.draw(cx, y + 20)
        cx += c.width + gap
        return out
      })
      return rect(x, y, width, 30, 8, C.pill) + body.join('')
    },
  }
}

const pillList = (m: Meter, readings: Reading[], withCost: boolean, bar = BAR): Chunk[] => {
  const list: Chunk[] = []
  if (withCost && m.costUsd !== undefined) list.push(pill([word('S', C.muted), word(`$${m.costUsd.toFixed(2)}`, C.text)]))
  for (const r of readings) {
    const q = r.quota
    const chunks = [word(SHORT[q.kind] ?? q.kind, C.muted), mini(q.percentUsed, bar), word(`${Math.round(q.percentUsed)}%`, C.text)]
    if (r.delta !== undefined) chunks.push(word(`${signed(r.delta)}%`, deltaColor(r.delta, q.percentUsed)))
    if (r.untilReset !== undefined) chunks.push(word(compact(r.untilReset), C.muted))
    list.push(pill(chunks))
  }

  return list
}

/*
 * Étire les mini-barres pour que la rangée de pastilles occupe exactement `room` ;
 * si elle ne tient pas sur une ligne, garde la taille de base (la rangée passe à la ligne).
 */
const fitPills = (m: Meter, readings: Reading[], withCost: boolean, room: number, gap: number): Chunk[] => {
  const base = pillList(m, readings, withCost)
  const used = base.reduce((sum, p) => sum + p.width, 0) + gap * Math.max(0, base.length - 1)
  const bars = readings.length
  if (bars === 0 || used >= room) return base

  return pillList(m, readings, withCost, BAR + (room - used) / bars)
}

const pills = (m: Meter, readings: Reading[], y: number): { svg: string; height: number } => {
  const list = fitPills(m, readings, true, W - 32, 8)
  const parts: string[] = []
  let x = 16
  let row = y
  for (const p of list) {
    if (x + p.width > W - 16 && x > 16) {
      x = 16
      row += 38
    }
    parts.push(p.draw(x, row))
    x += p.width + 8
  }

  return { svg: parts.join(''), height: list.length === 0 ? 0 : row - y + 30 }
}

type Drawing = { source: string; width: number; height: number }

const band = (m: Meter, at: number, chosen: Focus): Drawing => {
  const readings = m.quotas.filter(q => DURATION[q.kind]).map(q => readQuota(q, at))
  // Le grand bloc montre la fenêtre choisie ; à défaut, la plus serrée (le plus petit delta).
  const urgent = [...readings].sort((a, b) => (a.delta ?? Infinity) - (b.delta ?? Infinity))[0]
  const focus = readings.find(r => r.quota.kind === chosen) ?? urgent

  const top = focus ? hero(focus, 8) : { svg: '', height: 0 }
  const pillsY = 8 + top.height + 12
  const bottom = pills(m, readings, pillsY)
  const height = pillsY + bottom.height + 14

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}">` +
    STYLE +
    rect(0.5, 0.5, W - 1, height - 1, 18, `${C.card} s-${C.edge}`) +
    top.svg +
    bottom.svg +
    `</svg>`

  return { source, width: W, height }
}

/* Version réduite : une seule ligne de pastilles, sans carte ni coût. */
const strip = (m: Meter, at: number): Drawing => {
  const readings = m.quotas.filter(q => DURATION[q.kind]).map(q => readQuota(q, at))
  const gap = 6
  const list = fitPills(m, readings, false, W, gap)
  // Même largeur que la version complète : le bouton reste au même endroit d'une version à l'autre.
  const width = Math.max(W, Math.ceil(list.reduce((sum, p) => sum + p.width, 0) + gap * Math.max(0, list.length - 1)))
  let x = 0
  const body = list.map(p => {
    const out = p.draw(x, 0)
    x += p.width + gap
    return out
  })

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 30" width="${width}" height="30">` +
    STYLE +
    body.join('') +
    `</svg>`

  return { source, width, height: 30 }
}

const describe = (m: Meter, at: number): string =>
  m.quotas
    .filter(q => DURATION[q.kind])
    .map(q => {
      const r = readQuota(q, at)
      const d = r.delta === undefined ? '' : `, ${signed(r.delta)} points ${r.delta >= 0 ? 'd’avance' : 'de retard'}`
      return `${LABEL[q.kind]} : ${Math.round(q.percentUsed)} % utilisés${d}`
    })
    .join(' ; ')

/* ---------- branchements ---------- */

const toMeter = (rateLimits: SessionRateLimit[], cost?: SessionCost): Meter => ({
  quotas: rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  costUsd: cost?.usd,
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Nettoie ce qu'affichait la version précédente du mod.
    $.ui.status(undefined)
    void $.ui.close({ id: 'quotas' })

    await $.command.register({ name: 'quotas', description: 'Bascule la bande des quotas entre réduite et complète (off pour la masquer)' })

    const usage = await $.session.usage()
    await update($, meter, () => toMeter(usage.rateLimits, usage.cost))
    await update($, now, () => Date.now())
    $.clock.every(60_000, () => void update($, now, () => Date.now()))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, meter, () => toMeter(e.rateLimits, e.cost))
    await update($, now, () => Date.now())

    return next(e)
  })

  on('command.run', { command: 'quotas' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await read($, mode)
    const target: Mode =
      arg === 'off' || arg === 'masquer'
        ? 'masquee'
        : arg === 'complete' || arg === 'complète'
          ? 'complete'
          : arg === 'reduite' || arg === 'réduite'
            ? 'reduite'
            : current === 'reduite'
              ? 'complete'
              : 'reduite'
    await update($, mode, () => target)

    // Aucun texte : rien n'est ajouté à la conversation, donc rien n'est relu par le modèle.
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, mode)
    if (e.props.hasSurvey || shown === 'masquee') return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const m = await read($, meter)
    const at = await read($, now)

    if (m.quotas.length === 0) {
      return (
        <Box>
          <Text dimColor>Quotas : en attente de la première réponse de l’API.</Text>
        </Box>
      )
    }

    if (!Svg) {
      return (
        <Box>
          <Text dimColor>{describe(m, at)}</Text>
        </Box>
      )
    }

    // Le bouton bascule l'état du mod sans passer par la conversation : zéro token.
    const isComplete = shown === 'complete'
    const chosen = await read($, focus)
    const drawing = isComplete ? band(m, at, chosen) : strip(m, at)
    const toggle = (
      <Button
        key="bascule"
        label={isComplete ? 'Réduire' : 'Détails'}
        dimColor
        onPress={() => update($, mode, () => (isComplete ? 'reduite' : 'complete'))}
      />
    )
    // Version complète : un bouton par fenêtre ; un clic la met en grand, un second clic
    // sur le bouton actif rend la main au choix automatique (la fenêtre la plus serrée).
    const windows = m.quotas
      .map(q => q.kind)
      .filter((kind): kind is Exclude<Focus, 'auto'> => kind === 'five_hour' || kind === 'seven_day')
    return (
      // Observé sur le desktop : un bouton nu (ou dans une Box sans style) part en haut à
      // droite de la bande ; dans une Box avec du padding, il est centré à côté du SVG.
      // Le padding est symétrique pour que le centrage tombe pile sur les pastilles.
      <Box flexDirection="row" gap="sm">
        <Svg source={drawing.source} alt={describe(m, at)} width={drawing.width} height={drawing.height} />
        {isComplete ? (
          <Box paddingY="xs" flexDirection="column" gap="xs">
            {windows.map(kind => (
              <Button
                key={`fenetre-${kind}`}
                label={SHORT[kind] ?? kind}
                variant={chosen === kind ? 'primary' : 'secondary'}
                onPress={() => update($, focus, current => (current === kind ? 'auto' : kind))}
              />
            ))}
            {toggle}
          </Box>
        ) : (
          <Box paddingY="xs">{toggle}</Box>
        )}
      </Box>
    )
  })
}
