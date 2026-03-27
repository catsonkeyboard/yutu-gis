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
})
