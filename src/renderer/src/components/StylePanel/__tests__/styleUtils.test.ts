import { describe, it, expect } from 'vitest'
import { scanUniqueValues, scanNumericValues, computeBreaks, buildPaint } from '../styleUtils'
import { sampleRamp, COLOR_RAMPS } from '../colorRamps'
import type { LayerStyle } from '../../../stores/layerStore'

function fc(propsList: Record<string, unknown>[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: propsList.map((props) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: props
    }))
  }
}

describe('sampleRamp', () => {
  it('samples n colors evenly from a 9-color ramp', () => {
    const out = sampleRamp('Blues', 3)
    expect(out).toHaveLength(3)
    expect(out[0]).toBe(COLOR_RAMPS.Blues[0])
    expect(out[2]).toBe(COLOR_RAMPS.Blues[8])
  })

  it('cycles when asking for more colors than the ramp has', () => {
    const out = sampleRamp('Blues', 12)
    expect(out).toHaveLength(12)
    expect(out[9]).toBe(COLOR_RAMPS.Blues[0])
  })
})

describe('scanUniqueValues', () => {
  it('returns values by frequency desc with cap', () => {
    const data = fc([{ t: 'b' }, { t: 'a' }, { t: 'b' }, { t: 'c' }, { t: 'b' }, { t: 'a' }])
    const { values, truncated } = scanUniqueValues(data, 't', 2)
    expect(values).toEqual(['b', 'a'])
    expect(truncated).toBe(true)
  })

  it('skips empty values', () => {
    const data = fc([{ t: null }, { t: '' }, { t: 'x' }])
    expect(scanUniqueValues(data, 't', 30).values).toEqual(['x'])
  })
})

describe('scanNumericValues', () => {
  it('collects finite numbers including numeric strings', () => {
    const data = fc([{ v: 1 }, { v: '2.5' }, { v: 'abc' }, { v: null }])
    expect(scanNumericValues(data, 'v')).toEqual([1, 2.5])
  })
})

describe('computeBreaks', () => {
  it('equal interval breaks', () => {
    const breaks = computeBreaks([0, 10, 20, 30, 40], 4, 'equal')
    expect(breaks).toEqual([10, 20, 30])
  })

  it('quantile breaks', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8]
    const breaks = computeBreaks(values, 2, 'quantile')
    expect(breaks).toHaveLength(1)
    expect(breaks[0]).toBeGreaterThanOrEqual(4)
    expect(breaks[0]).toBeLessThanOrEqual(5)
  })

  it('handles all-equal values without duplicate breaks', () => {
    const breaks = computeBreaks([5, 5, 5, 5], 3, 'equal')
    expect(new Set(breaks).size).toBe(breaks.length)
  })
})

const BASE: LayerStyle = {
  mode: 'single',
  fillColor: '#ff0000',
  strokeColor: '#00ff00',
  strokeWidth: 2,
  pointRadius: 6,
  fillOpacity: 0.5
}

describe('buildPaint', () => {
  it('single mode produces constant colors', () => {
    const { fill, line, circle } = buildPaint(BASE, 0.8)
    expect(fill['fill-color']).toBe('#ff0000')
    expect(fill['fill-opacity']).toBeCloseTo(0.4)
    expect(line['line-color']).toBe('#00ff00')
    expect(line['line-width']).toBe(2)
    expect(circle['circle-radius']).toBe(6)
  })

  it('categorized mode produces match expression', () => {
    const style: LayerStyle = {
      ...BASE,
      mode: 'categorized',
      field: 'kind',
      categories: [
        { value: 'a', color: '#111111' },
        { value: 'b', color: '#222222' }
      ],
      fallbackColor: '#999999'
    }
    const { fill } = buildPaint(style, 1)
    const expr = fill['fill-color'] as unknown[]
    expect(expr[0]).toBe('match')
    expect(expr).toContain('#111111')
    expect(expr[expr.length - 1]).toBe('#999999')
  })

  it('graduated mode produces step expression', () => {
    const style: LayerStyle = {
      ...BASE,
      mode: 'graduated',
      field: 'pop',
      breaks: [
        { max: 100, color: '#111111' },
        { max: 200, color: '#222222' },
        { max: null, color: '#333333' }
      ]
    }
    const { fill } = buildPaint(style, 1)
    const expr = fill['fill-color'] as unknown[]
    expect(expr[0]).toBe('step')
    expect(expr).toContain(100)
    expect(expr).toContain(200)
    expect(expr).not.toContain(null)
    expect(expr[expr.length - 1]).toBe('#333333')
  })
})
