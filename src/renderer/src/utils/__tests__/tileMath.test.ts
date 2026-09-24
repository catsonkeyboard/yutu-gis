import { describe, it, expect } from 'vitest'
import { deg2num, countTiles } from '../tileMath'

describe('deg2num', () => {
  it('maps the null island to tile (0,0) at any zoom', () => {
    expect(deg2num(0, 0, 0)).toEqual([0, 0])
    expect(deg2num(0, 0, 3)).toEqual([4, 4])
  })

  it('matches known OSM tile numbers (equator / Greenwich)', () => {
    // Reference values from the standard slippy-map tilenames algorithm
    expect(deg2num(0, 0, 1)).toEqual([1, 1])
    expect(deg2num(85.05112878, -180, 1)).toEqual([0, 0]) // top-left corner
    expect(deg2num(-85.05112878, 180, 1)).toEqual([1, 1]) // bottom-right corner
  })

  it('places Beijing at the correct z12 tile', () => {
    // 116.397E, 39.909N → x=3372, y=1552 at z12 (slippy-map tilenames reference)
    expect(deg2num(39.9093, 116.3974, 12)).toEqual([3372, 1552])
  })

  it('clamps latitude beyond the Web Mercator limit', () => {
    // Poles are not representable — must clamp instead of producing NaN/out-of-range
    const [x1, y1] = deg2num(89.9, 0, 4)
    const [x2, y2] = deg2num(-89.9, 0, 4)
    expect(y1).toBe(0)
    expect(y2).toBe(15)
    expect(x1).toBe(x2) // longitude still centered
  })

  it('clamps x/y into [0, 2^z - 1]', () => {
    const n = Math.pow(2, 5) - 1
    const [x, y] = deg2num(84, 179.9, 5)
    expect(x).toBeLessThanOrEqual(n)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(n)
  })
})

describe('countTiles', () => {
  it('counts exactly 1 tile for a point-sized area at a single zoom', () => {
    // A tiny bbox around Beijing at z0 — the whole world is one tile
    expect(countTiles(39.89, 116.39, 39.91, 116.4, 0, 0)).toBe(1)
  })

  it('doubles per axis per zoom level for a world-wide bbox', () => {
    // Whole world: z0→1, z1→4, z2→16 ⇒ total 21 (args: south, west, north, east)
    expect(countTiles(-85.05, -180, 85.05, 180, 0, 2)).toBe(21)
  })

  it('sums across the zoom range (min≠max)', () => {
    const single = countTiles(29, 100, 30, 101, 5, 5)
    const ranged = countTiles(29, 100, 30, 101, 5, 6)
    const z6 = countTiles(29, 100, 30, 101, 6, 6)
    expect(ranged).toBe(single + z6)
  })

  it('grows when the bbox expands', () => {
    const small = countTiles(39.8, 116.3, 39.9, 116.4, 14, 14)
    const large = countTiles(39.5, 116.0, 40.0, 117.0, 14, 14)
    expect(large).toBeGreaterThan(small)
  })
})
