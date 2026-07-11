import { describe, it, expect } from 'vitest'
import { deriveColumns, applyFilter, fieldStats, displayValue } from '../tableUtils'

function feat(props: Record<string, unknown> | null): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: props }
}

describe('deriveColumns', () => {
  it('collects union of keys in first-seen order', () => {
    const { columns, truncated } = deriveColumns([
      feat({ b: 1, a: 2 }),
      feat({ c: 3, a: 4 })
    ])
    expect(columns.map((c) => c.key)).toEqual(['b', 'a', 'c'])
    expect(truncated).toBe(false)
  })

  it('puts internal (_-prefixed) fields last', () => {
    const { columns } = deriveColumns([feat({ _osm_id: 1, name: 'x', _t: 2, kind: 'y' })])
    expect(columns.map((c) => c.key)).toEqual(['name', 'kind', '_osm_id', '_t'])
    expect(columns[2].internal).toBe(true)
  })

  it('detects numeric columns, mixed types are not numeric', () => {
    const { columns } = deriveColumns([
      feat({ n: 1, m: 'a', x: '5' }),
      feat({ n: 2.5, m: 3, x: null })
    ])
    const byKey = Object.fromEntries(columns.map((c) => [c.key, c.numeric]))
    expect(byKey.n).toBe(true)
    expect(byKey.m).toBe(false) // mixed string + number
    expect(byKey.x).toBe(true) // numeric strings count, null ignored
  })

  it('caps column count and reports truncation', () => {
    const props: Record<string, unknown> = {}
    for (let i = 0; i < 70; i++) props[`k${i}`] = i
    const { columns, truncated } = deriveColumns([feat(props)], 60)
    expect(columns).toHaveLength(60)
    expect(truncated).toBe(true)
  })

  it('handles null properties', () => {
    const { columns } = deriveColumns([feat(null), feat({ a: 1 })])
    expect(columns.map((c) => c.key)).toEqual(['a'])
  })
})

describe('applyFilter', () => {
  const features = [
    feat({ pop: 100, name: 'Alpha' }),
    feat({ pop: 250, name: 'beta' }),
    feat({ pop: '30', name: '' }),
    feat({ name: 'Gamma' }) // pop missing
  ]
  const numeric = new Set(['pop'])

  it('returns all when filter is null', () => {
    expect(applyFilter(features, null, numeric)).toHaveLength(4)
  })

  it('numeric gt compares as numbers', () => {
    const out = applyFilter(features, { field: 'pop', op: 'gt', value: '90' }, numeric)
    expect(out).toHaveLength(2) // 100, 250 — '30' excluded numerically
  })

  it('eq on numeric field', () => {
    const out = applyFilter(features, { field: 'pop', op: 'eq', value: '30' }, numeric)
    expect(out).toHaveLength(1)
  })

  it('contains is case-insensitive text match', () => {
    const out = applyFilter(features, { field: 'name', op: 'contains', value: 'A' }, numeric)
    expect(out.map((f) => f.properties?.name)).toEqual(['Alpha', 'beta', 'Gamma'])
  })

  it('empty matches missing, null and empty string', () => {
    const out = applyFilter(features, { field: 'pop', op: 'empty', value: '' }, numeric)
    expect(out).toHaveLength(1)
    const out2 = applyFilter(features, { field: 'name', op: 'empty', value: '' }, numeric)
    expect(out2).toHaveLength(1)
  })

  it('notEmpty is the complement of empty', () => {
    const out = applyFilter(features, { field: 'pop', op: 'notEmpty', value: '' }, numeric)
    expect(out).toHaveLength(3)
  })

  it('ne keeps rows with missing values', () => {
    const out = applyFilter(features, { field: 'pop', op: 'ne', value: '100' }, numeric)
    expect(out).toHaveLength(3)
  })
})

describe('fieldStats', () => {
  it('computes numeric stats over non-empty values', () => {
    const features = [feat({ v: 10 }), feat({ v: '20' }), feat({ v: null }), feat({})]
    const s = fieldStats(features, 'v', true)
    expect(s.count).toBe(2)
    expect(s).toMatchObject({ min: 10, max: 20, mean: 15, sum: 30 })
  })

  it('computes unique count for text fields', () => {
    const features = [feat({ t: 'a' }), feat({ t: 'b' }), feat({ t: 'a' }), feat({ t: '' })]
    const s = fieldStats(features, 't', false)
    expect(s.count).toBe(3)
    expect(s).toMatchObject({ unique: 2 })
  })
})

describe('displayValue', () => {
  it('stringifies primitives', () => {
    expect(displayValue(5)).toBe('5')
    expect(displayValue(null)).toBe('')
    expect(displayValue(undefined)).toBe('')
    expect(displayValue(true)).toBe('true')
  })

  it('JSON-stringifies objects and truncates to 120 chars', () => {
    const big = { arr: Array(100).fill('xxxx') }
    const out = displayValue(big)
    expect(out.length).toBeLessThanOrEqual(121) // 120 + ellipsis
    expect(out.startsWith('{')).toBe(true)
  })
})
