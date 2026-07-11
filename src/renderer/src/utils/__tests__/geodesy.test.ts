import { describe, it, expect } from 'vitest'
import { haversineDistance, pathLength, sphericalArea, formatDistance, formatArea } from '../geodesy'
import { wgs84ToGcj02, gcj02ToWgs84 } from '../coordTransform'

describe('haversineDistance', () => {
  it('Beijing–Shanghai is about 1068 km', () => {
    const d = haversineDistance([116.3974, 39.9093], [121.4737, 31.2304])
    expect(d).toBeGreaterThan(1063000)
    expect(d).toBeLessThan(1073000)
  })

  it('zero distance for identical points', () => {
    expect(haversineDistance([10, 20], [10, 20])).toBe(0)
  })
})

describe('pathLength', () => {
  it('sums segment distances', () => {
    const a: [number, number] = [0, 0]
    const b: [number, number] = [1, 0]
    const c: [number, number] = [2, 0]
    expect(pathLength([a, b, c])).toBeCloseTo(haversineDistance(a, b) + haversineDistance(b, c), 6)
  })

  it('is zero for fewer than 2 points', () => {
    expect(pathLength([[1, 1]])).toBe(0)
  })
})

describe('sphericalArea', () => {
  it('1°x1° quad at equator is about 12,364 km²', () => {
    const ring: [number, number][] = [
      [0, 0], [1, 0], [1, 1], [0, 1], [0, 0]
    ]
    const areaKm2 = sphericalArea(ring) / 1e6
    expect(areaKm2).toBeGreaterThan(12000)
    expect(areaKm2).toBeLessThan(12700)
  })

  it('returns 0 for degenerate rings', () => {
    expect(sphericalArea([[0, 0], [1, 1]])).toBe(0)
  })
})

describe('formatting', () => {
  it('formats distance in m below 1 km, km above', () => {
    expect(formatDistance(532)).toBe('532 m')
    expect(formatDistance(1532)).toBe('1.53 km')
  })

  it('formats area m² / ha / km²', () => {
    expect(formatArea(5000)).toBe('5000 m²')
    expect(formatArea(50000)).toBe('5.00 ha')
    expect(formatArea(2500000)).toBe('2.50 km²')
  })
})

describe('gcj02ToWgs84', () => {
  it('round-trips within 1e-6 degrees inside China', () => {
    const [glng, glat] = wgs84ToGcj02(116.3974, 39.9093)
    const [wlng, wlat] = gcj02ToWgs84(glng, glat)
    expect(Math.abs(wlng - 116.3974)).toBeLessThan(1e-6)
    expect(Math.abs(wlat - 39.9093)).toBeLessThan(1e-6)
  })

  it('is identity outside China', () => {
    const [lng, lat] = gcj02ToWgs84(-74.006, 40.7128)
    expect(lng).toBe(-74.006)
    expect(lat).toBe(40.7128)
  })
})
