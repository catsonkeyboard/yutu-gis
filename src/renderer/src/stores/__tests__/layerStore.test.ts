import { describe, it, expect, beforeEach } from 'vitest'
import { useLayerStore } from '../layerStore'

describe('layerStore', () => {
  beforeEach(() => useLayerStore.getState().reset())

  it('starts with empty layers', () => {
    expect(useLayerStore.getState().layers).toEqual([])
  })

  it('adds a layer', () => {
    useLayerStore.getState().addLayer({ id: '1', name: 'Test', type: 'geojson', source: {}, visible: true, opacity: 1 })
    expect(useLayerStore.getState().layers).toHaveLength(1)
  })

  it('toggles visibility', () => {
    useLayerStore.getState().addLayer({ id: '1', name: 'Test', type: 'geojson', source: {}, visible: true, opacity: 1 })
    useLayerStore.getState().toggleVisible('1')
    expect(useLayerStore.getState().layers[0].visible).toBe(false)
  })

  it('removes a layer', () => {
    useLayerStore.getState().addLayer({ id: '1', name: 'Test', type: 'geojson', source: {}, visible: true, opacity: 1 })
    useLayerStore.getState().removeLayer('1')
    expect(useLayerStore.getState().layers).toHaveLength(0)
  })

  it('sets opacity', () => {
    useLayerStore.getState().addLayer({ id: '1', name: 'Test', type: 'geojson', source: {}, visible: true, opacity: 1 })
    useLayerStore.getState().setOpacity('1', 0.5)
    expect(useLayerStore.getState().layers[0].opacity).toBe(0.5)
  })

  it('bumps sourceVersion on data mutations only', () => {
    const s = useLayerStore.getState()
    s.addLayer({ id: '1', name: 'Test', type: 'geojson', source: {}, visible: true, opacity: 1 })
    const v0 = useLayerStore.getState().layers[0].sourceVersion!
    s.setStyle('1', {
      mode: 'single', fillColor: '#fff', strokeColor: '#000',
      strokeWidth: 1, pointRadius: 3, fillOpacity: 0.5,
    })
    expect(useLayerStore.getState().layers[0].sourceVersion).toBe(v0)
    s.setSource('1', { type: 'FeatureCollection', features: [] })
    const v1 = useLayerStore.getState().layers[0].sourceVersion!
    expect(v1).toBeGreaterThan(v0)
    s.appendFeatures('1', [])
    expect(useLayerStore.getState().layers[0].sourceVersion!).toBeGreaterThan(v1)
  })

  it('re-adding the same id yields a different sourceVersion', () => {
    const s = useLayerStore.getState()
    s.addLayer({ id: '1', name: 'A', type: 'geojson', source: {}, visible: true, opacity: 1 })
    const v0 = useLayerStore.getState().layers[0].sourceVersion!
    s.removeLayer('1')
    s.addLayer({ id: '1', name: 'B', type: 'geojson', source: {}, visible: true, opacity: 1 })
    expect(useLayerStore.getState().layers[0].sourceVersion).not.toBe(v0)
  })

  it('clears the lazy marker without touching the source', () => {
    const s = useLayerStore.getState()
    s.addLayer({
      id: '1', name: 'Lazy', type: 'geojson', source: {}, visible: true, opacity: 1,
      lazy: { path: '/x/a.geojson' },
    })
    const before = useLayerStore.getState().layers[0].source
    s.clearLazy('1')
    expect(useLayerStore.getState().layers[0].lazy).toBeUndefined()
    expect(useLayerStore.getState().layers[0].source).toBe(before)
  })

  it('contentHash: set via setSource, cleared by appendFeatures', () => {
    const emptyFc = { type: 'FeatureCollection' as const, features: [] }
    const s = useLayerStore.getState()
    s.addLayer({ id: '1', name: 'T', type: 'geojson', source: emptyFc, visible: true, opacity: 1, contentHash: 'h0' })
    expect(useLayerStore.getState().layers[0].contentHash).toBe('h0')
    s.setSource('1', emptyFc)
    expect(useLayerStore.getState().layers[0].contentHash).toBeUndefined()
    s.setSource('1', emptyFc, 'h1')
    expect(useLayerStore.getState().layers[0].contentHash).toBe('h1')
    s.appendFeatures('1', [])
    expect(useLayerStore.getState().layers[0].contentHash).toBeUndefined()
  })
})
