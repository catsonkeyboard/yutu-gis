export interface ColumnInfo {
  key: string
  numeric: boolean
  internal: boolean
}

export interface DeriveResult {
  columns: ColumnInfo[]
  truncated: boolean
}

export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'empty' | 'notEmpty'

export interface RowFilter {
  field: string
  op: FilterOp
  value: string
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function asNumber(v: unknown): number | null {
  if (isEmptyValue(v)) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Union of property keys across features, first-seen order,
 * `_`-prefixed internal keys moved to the end. A column is numeric when
 * every non-empty value converts to a finite number.
 */
export function deriveColumns(features: GeoJSON.Feature[], cap = 60): DeriveResult {
  const info = new Map<string, { numeric: boolean; hasValue: boolean }>()
  for (const f of features) {
    const props = f.properties
    if (!props) continue
    for (const [key, v] of Object.entries(props)) {
      let entry = info.get(key)
      if (!entry) {
        entry = { numeric: true, hasValue: false }
        info.set(key, entry)
      }
      if (isEmptyValue(v)) continue
      entry.hasValue = true
      if (typeof v === 'object' || asNumber(v) === null) entry.numeric = false
      else if (typeof v !== 'number' && typeof v !== 'string') entry.numeric = false
    }
  }
  const all = [...info.entries()].map(([key, e]) => ({
    key,
    numeric: e.hasValue && e.numeric,
    internal: key.startsWith('_')
  }))
  // Mixed string+number columns: numeric only if ALL values were the same numeric-ish —
  // handled above by conversion; but a column with both 'a' and 3 already failed on 'a'.
  const ordered = [...all.filter((c) => !c.internal), ...all.filter((c) => c.internal)]
  return { columns: ordered.slice(0, cap), truncated: ordered.length > cap }
}

export function applyFilter(
  features: GeoJSON.Feature[],
  filter: RowFilter | null,
  numericFields: Set<string>
): GeoJSON.Feature[] {
  if (!filter || !filter.field) return features
  const { field, op, value } = filter
  const numeric = numericFields.has(field)
  const numValue = Number(value)

  return features.filter((f) => {
    const v = f.properties?.[field]
    if (op === 'empty') return isEmptyValue(v)
    if (op === 'notEmpty') return !isEmptyValue(v)
    if (op === 'contains') {
      if (isEmptyValue(v)) return false
      return String(v).toLowerCase().includes(value.toLowerCase())
    }
    if (numeric && Number.isFinite(numValue)) {
      const n = asNumber(v)
      switch (op) {
        case 'eq':
          return n !== null && n === numValue
        case 'ne':
          return n === null || n !== numValue
        case 'gt':
          return n !== null && n > numValue
        case 'gte':
          return n !== null && n >= numValue
        case 'lt':
          return n !== null && n < numValue
        case 'lte':
          return n !== null && n <= numValue
      }
    }
    const s = isEmptyValue(v) ? '' : String(v)
    switch (op) {
      case 'eq':
        return s === value
      case 'ne':
        return s !== value
      case 'gt':
        return s > value
      case 'gte':
        return s >= value
      case 'lt':
        return s < value
      case 'lte':
        return s <= value
      default:
        return true
    }
  })
}

export type FieldStatsResult = { count: number } & (
  | { min: number; max: number; mean: number; sum: number }
  | { unique: number }
)

export function fieldStats(
  features: GeoJSON.Feature[],
  key: string,
  numeric: boolean
): FieldStatsResult {
  if (numeric) {
    let count = 0
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const f of features) {
      const n = asNumber(f.properties?.[key])
      if (n === null) continue
      count++
      sum += n
      if (n < min) min = n
      if (n > max) max = n
    }
    return count === 0
      ? { count: 0, min: 0, max: 0, mean: 0, sum: 0 }
      : { count, min, max, mean: sum / count, sum }
  }
  const seen = new Set<string>()
  let count = 0
  for (const f of features) {
    const v = f.properties?.[key]
    if (isEmptyValue(v)) continue
    count++
    seen.add(String(v))
  }
  return { count, unique: seen.size }
}

export function displayValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 120 ? s.slice(0, 120) + '…' : s
  }
  return String(v)
}
