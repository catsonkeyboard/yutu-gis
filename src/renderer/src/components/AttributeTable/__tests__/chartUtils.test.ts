import { describe, it, expect } from 'vitest'
import { histogramBins, topCounts } from '../chartUtils'

describe('histogramBins', () => {
  it('creates equal-width bins covering the value range', () => {
    const bins = histogramBins([0, 1, 2, 3, 4, 5, 6, 7, 8, 10], 5)
    expect(bins).toHaveLength(5)
    expect(bins[0].x0).toBe(0)
    expect(bins[4].x1).toBe(10)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(10)
  })

  it('max value falls into the last bin', () => {
    const bins = histogramBins([0, 10], 2)
    expect(bins[1].count).toBe(1)
  })

  it('all-equal values produce a single bucket', () => {
    const bins = histogramBins([5, 5, 5], 4)
    expect(bins).toHaveLength(1)
    expect(bins[0].count).toBe(3)
  })

  it('empty input produces no bins', () => {
    expect(histogramBins([], 10)).toEqual([])
  })
})

describe('topCounts', () => {
  it('orders by frequency and aggregates the rest into other', () => {
    const values = ['a', 'b', 'a', 'c', 'a', 'b', 'd', null, '']
    const { items, otherCount } = topCounts(values, 2)
    expect(items).toEqual([
      { label: 'a', count: 3 },
      { label: 'b', count: 2 },
    ])
    expect(otherCount).toBe(2) // c + d; null/'' skipped
  })

  it('no other when everything fits', () => {
    const { items, otherCount } = topCounts(['x', 'y'], 5)
    expect(items).toHaveLength(2)
    expect(otherCount).toBe(0)
  })
})
