import type { LayerStyle } from '../../stores/layerStore'

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** Unique values of a field ordered by frequency (desc), capped. */
export function scanUniqueValues(
  fc: GeoJSON.FeatureCollection,
  field: string,
  cap = 30
): { values: string[]; truncated: boolean } {
  const counts = new Map<string, number>()
  for (const f of fc.features) {
    const v = f.properties?.[field]
    if (isEmptyValue(v)) continue
    const s = String(v)
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
  return { values: sorted.slice(0, cap), truncated: sorted.length > cap }
}

/** All finite numeric values of a field (numeric strings included). */
export function scanNumericValues(fc: GeoJSON.FeatureCollection, field: string): number[] {
  const out: number[] = []
  for (const f of fc.features) {
    const v = f.properties?.[field]
    if (isEmptyValue(v)) continue
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** n-1 ascending upper-bound thresholds for n classes (duplicates removed). */
export function computeBreaks(values: number[], n: number, method: 'equal' | 'quantile'): number[] {
  if (!values.length || n < 2) return []
  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const breaks: number[] = []
  for (let i = 1; i < n; i++) {
    if (method === 'equal') {
      breaks.push(min + ((max - min) * i) / n)
    } else {
      const idx = (sorted.length * i) / n
      const lo = Math.max(0, Math.ceil(idx) - 1)
      breaks.push(sorted[Math.min(sorted.length - 1, lo)])
    }
  }
  // Deduplicate (all-equal values or heavy ties would create invalid step expressions)
  const unique: number[] = []
  for (const b of breaks) {
    if (!unique.length || b > unique[unique.length - 1]) unique.push(b)
    else unique.push(unique[unique.length - 1] + Math.max(1e-9, Math.abs(b) * 1e-9))
  }
  return unique
}

type Paint = Record<string, unknown>

function colorExpression(style: LayerStyle, singleColor: string): unknown {
  if (style.mode === 'categorized' && style.field && style.categories?.length) {
    const expr: unknown[] = ['match', ['to-string', ['get', style.field]]]
    for (const c of style.categories) {
      expr.push(c.value, c.color)
    }
    expr.push(style.fallbackColor ?? '#999999')
    return expr
  }
  if (style.mode === 'graduated' && style.field && style.breaks?.length) {
    const breaks = style.breaks
    const firstMax = breaks[0].max ?? 0
    const expr: unknown[] = ['step', ['to-number', ['get', style.field], firstMax - 1], breaks[0].color]
    for (let i = 1; i < breaks.length; i++) {
      const prevMax = breaks[i - 1].max
      if (prevMax === null) break
      expr.push(prevMax, breaks[i].color)
    }
    return expr
  }
  return singleColor
}

/** MapLibre paint objects for a styled layer (fill / line / circle). */
export function buildPaint(
  style: LayerStyle,
  layerOpacity: number
): { fill: Paint; line: Paint; circle: Paint } {
  const fillColor = colorExpression(style, style.fillColor)
  const strokeColor = style.mode === 'single' ? style.strokeColor : colorExpression(style, style.strokeColor)
  return {
    fill: {
      'fill-color': fillColor,
      'fill-opacity': style.fillOpacity * layerOpacity,
    },
    line: {
      'line-color': strokeColor,
      'line-width': style.strokeWidth,
      'line-opacity': layerOpacity,
    },
    circle: {
      'circle-color': fillColor,
      'circle-radius': style.pointRadius,
      'circle-opacity': layerOpacity,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  }
}

export const DEFAULT_STYLE: LayerStyle = {
  mode: 'single',
  fillColor: '#0080ff',
  strokeColor: '#0080ff',
  strokeWidth: 1.5,
  pointRadius: 5,
  fillOpacity: 0.4,
}
