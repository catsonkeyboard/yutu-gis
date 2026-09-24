import { describe, it, expect } from 'vitest'
import { getGeoJSONBounds, getFeatureBounds, matchesSelectedProps } from '../geo'

type SimpleGeometry = Extract<GeoJSON.Geometry, { coordinates: unknown }>
type AnyFeature = GeoJSON.Feature<GeoJSON.Geometry | null>

const fc = (...features: AnyFeature[]): GeoJSON.FeatureCollection<GeoJSON.Geometry | null> => ({
  type: 'FeatureCollection',
  features
})

const feature = (type: SimpleGeometry['type'], coordinates: unknown): GeoJSON.Feature => ({
  type: 'Feature',
  properties: null,
  geometry: { type, coordinates } as SimpleGeometry
})

const nullGeomFeature = (): AnyFeature => ({ type: 'Feature', properties: null, geometry: null })

describe('getGeoJSONBounds', () => {
  it('returns null for an empty collection', () => {
    expect(getGeoJSONBounds(fc())).toBeNull()
  })

  it('returns null when all features lack geometry', () => {
    const collection = fc(nullGeomFeature())
    expect(getGeoJSONBounds(collection)).toBeNull()
  })

  it('computes bounds of simple points', () => {
    const collection = fc(feature('Point', [116.0, 39.0]), feature('Point', [121.0, 31.0]))
    expect(getGeoJSONBounds(collection)).toEqual([
      [116.0, 31.0],
      [121.0, 39.0]
    ])
  })

  it('computes bounds of polygons', () => {
    const collection = fc(
      feature('Polygon', [
        [
          [100.0, 30.0],
          [102.0, 30.0],
          [102.0, 32.0],
          [100.0, 32.0],
          [100.0, 30.0]
        ]
      ])
    )
    expect(getGeoJSONBounds(collection)).toEqual([
      [100.0, 30.0],
      [102.0, 32.0]
    ])
  })

  it('traverses deeply nested MultiPolygon coordinates', () => {
    const collection = fc(
      feature('MultiPolygon', [
        [
          [
            [110.0, 20.0],
            [112.0, 20.0],
            [112.0, 22.0],
            [110.0, 22.0],
            [110.0, 20.0]
          ]
        ],
        [
          [
            [130.0, 40.0],
            [131.0, 40.0],
            [131.0, 41.0],
            [130.0, 41.0],
            [130.0, 40.0]
          ]
        ]
      ])
    )
    expect(getGeoJSONBounds(collection)).toEqual([
      [110.0, 20.0],
      [131.0, 41.0]
    ])
  })

  it('handles negative coordinates (western hemisphere)', () => {
    const collection = fc(feature('Point', [-122.4, 37.8]), feature('Point', [-73.9, 40.7]))
    expect(getGeoJSONBounds(collection)).toEqual([
      [-122.4, 37.8],
      [-73.9, 40.7]
    ])
  })
})

describe('getFeatureBounds', () => {
  it('returns null for null geometry', () => {
    expect(getFeatureBounds(nullGeomFeature())).toBeNull()
  })

  it('adds a 0.005° buffer around a single point', () => {
    const bounds = getFeatureBounds(feature('Point', [116.4, 39.9]))
    expect(bounds).not.toBeNull()
    const [[minLng, minLat], [maxLng, maxLat]] = bounds!
    expect(minLng).toBeCloseTo(116.395, 10)
    expect(minLat).toBeCloseTo(39.895, 10)
    expect(maxLng).toBeCloseTo(116.405, 10)
    expect(maxLat).toBeCloseTo(39.905, 10)
  })

  it('does NOT buffer an extent that already has area', () => {
    const bounds = getFeatureBounds(
      feature('LineString', [
        [100.0, 30.0],
        [102.0, 32.0]
      ])
    )
    expect(bounds).toEqual([
      [100.0, 30.0],
      [102.0, 32.0]
    ])
  })
})

describe('matchesSelectedProps', () => {
  it('returns false when nothing is selected', () => {
    expect(matchesSelectedProps({ a: 1 }, null)).toBe(false)
  })

  it('matches OSM features by (_osm_id, _osm_type) only', () => {
    const selected = { _osm_id: 123, _osm_type: 'way', extra: 'stale' }
    const candidate = { _osm_id: 123, _osm_type: 'way', extra: 'changed' }
    const other = { _osm_id: 456, _osm_type: 'way' }
    expect(matchesSelectedProps(candidate, selected)).toBe(true)
    expect(matchesSelectedProps(other, selected)).toBe(false)
  })

  it('requires BOTH id and type to match for OSM features', () => {
    const selected = { _osm_id: 123, _osm_type: 'way' }
    expect(matchesSelectedProps({ _osm_id: 123, _osm_type: 'relation' }, selected)).toBe(false)
  })

  it('falls back to deep equality for non-OSM features', () => {
    const selected = { a: 1, b: 'x' }
    expect(matchesSelectedProps({ a: 1, b: 'x' }, selected)).toBe(true)
    expect(matchesSelectedProps({ a: 1, b: 'y' }, selected)).toBe(false)
    expect(matchesSelectedProps({ a: 1 }, selected)).toBe(false)
  })

  it('CAVEAT: JSON.stringify fallback is key-order sensitive (documented behavior)', () => {
    // Same values, different insertion order — the stringified comparison
    // does NOT match. If this test ever breaks, key-order-insensitive
    // matching was introduced (an improvement — update this test).
    const selected = { a: 1, b: 'x' }
    expect(matchesSelectedProps({ b: 'x', a: 1 }, selected)).toBe(false)
  })
})
