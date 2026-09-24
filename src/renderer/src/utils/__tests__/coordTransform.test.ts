import { describe, it, expect } from 'vitest'
import { wgs84ToGcj02, gcj02ToWgs84, convertToGcj02 } from '../coordTransform'

const point = (lng: number, lat: number): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Point', coordinates: [lng, lat] }
    }
  ]
})

describe('wgs84ToGcj02', () => {
  it('returns coordinates unchanged outside mainland China', () => {
    // London
    expect(wgs84ToGcj02(-0.1276, 51.5072)).toEqual([-0.1276, 51.5072])
    // Far-east Russia edge (outside the GCJ-02 bounding box)
    expect(wgs84ToGcj02(140.0, 48.5)).toEqual([140.0, 48.5])
  })

  it('shifts Beijing by roughly 300–800 m', () => {
    const [lng, lat] = wgs84ToGcj02(116.3974, 39.9093)
    // ~1e-4 deg ≈ 11 m at this latitude — GCJ-02 offsets are ~100-700 m
    const dLng = Math.abs(lng - 116.3974)
    const dLat = Math.abs(lat - 39.9093)
    expect(dLng).toBeGreaterThan(5e-4)
    expect(dLng).toBeLessThan(1e-2)
    expect(dLat).toBeGreaterThan(5e-4)
    expect(dLat).toBeLessThan(1e-2)
  })

  it('keeps altitude components untouched (3-element positions via convertToGcj02)', () => {
    const out = convertToGcj02(point(116.3974, 39.9093)).features[0].geometry as GeoJSON.Point
    const withAlt: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: { type: 'Point', coordinates: [116.3974, 39.9093, 50] }
        }
      ]
    }
    const alt = convertToGcj02(withAlt).features[0].geometry as GeoJSON.Point
    expect(alt.coordinates).toHaveLength(3)
    expect(alt.coordinates[2]).toBe(50)
    expect(out.coordinates).toHaveLength(2)
  })
})

describe('gcj02ToWgs84', () => {
  it('round-trips a mainland coordinate to sub-meter precision', () => {
    const wgs = [116.3974, 39.9093] as const
    const [gLng, gLat] = wgs84ToGcj02(wgs[0], wgs[1])
    const [rLng, rLat] = gcj02ToWgs84(gLng, gLat)
    expect(Math.abs(rLng - wgs[0])).toBeLessThan(1e-6)
    expect(Math.abs(rLat - wgs[1])).toBeLessThan(1e-6)
  })

  it('returns coordinates unchanged outside mainland China', () => {
    expect(gcj02ToWgs84(2.3522, 48.8566)).toEqual([2.3522, 48.8566])
  })
})

describe('convertToGcj02', () => {
  it('converts every geometry type including nested MultiPolygon', () => {
    const fc: GeoJSON.FeatureCollection<GeoJSON.Geometry | null> = {
      type: 'FeatureCollection',
      features: [
        // Point inside China — must shift
        {
          type: 'Feature',
          properties: null,
          geometry: { type: 'Point', coordinates: [116.4, 39.9] }
        },
        // LineString crossing in and out of China — vertices shift individually
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [116.4, 39.9],
              [-0.1276, 51.5072]
            ]
          }
        },
        // MultiPolygon — deeply nested position arrays must be traversed
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [116.3, 39.8],
                  [116.4, 39.8],
                  [116.4, 39.9],
                  [116.3, 39.9],
                  [116.3, 39.8]
                ]
              ]
            ]
          }
        },
        // Feature with null geometry must pass through untouched
        { type: 'Feature', properties: null, geometry: null }
      ]
    }
    const out = convertToGcj02(fc)
    // Point shifted
    const p = out.features[0].geometry as GeoJSON.Point
    expect(p.coordinates[0]).not.toBe(116.4)
    // London vertex unchanged, Beijing vertex shifted
    const line = out.features[1].geometry as GeoJSON.LineString
    expect(line.coordinates[0][0]).not.toBe(116.4)
    expect(line.coordinates[1]).toEqual([-0.1276, 51.5072])
    // MultiPolygon ring traversed
    const mp = out.features[2].geometry as GeoJSON.MultiPolygon
    expect(mp.coordinates[0][0][0][0]).not.toBe(116.3)
    // Null geometry preserved
    expect(out.features[3].geometry).toBeNull()
    // Original input NOT mutated
    const orig = fc.features[0].geometry as GeoJSON.Point
    expect(orig.coordinates).toEqual([116.4, 39.9])
  })

  it('does not mutate the input collection', () => {
    const input = point(116.4, 39.9)
    const snapshot = JSON.stringify(input)
    convertToGcj02(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('shifts a known fixed point by a plausible offset (regression anchor)', () => {
    // Regression anchor: exact outputs of the current implementation.
    // If these change, coordinate handling has been altered — review carefully.
    const [lng, lat] = wgs84ToGcj02(121.4737, 31.2304) // Shanghai
    expect(lng).toBeCloseTo(121.47822, 5)
    expect(lat).toBeCloseTo(31.22846, 5)
    const [bLng, bLat] = wgs84ToGcj02(116.3974, 39.9093) // Beijing
    expect(bLng).toBeCloseTo(116.40364, 5)
    expect(bLat).toBeCloseTo(39.9107, 5)
  })
})

describe('point() sanity', () => {
  it('builds a valid FeatureCollection', () => {
    const fc = point(116.4, 39.9)
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
  })
})
