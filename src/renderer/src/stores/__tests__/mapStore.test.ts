import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from '../mapStore'

describe('mapStore', () => {
  beforeEach(() => useMapStore.getState().reset())

  it('has default center and zoom', () => {
    const { center, zoom } = useMapStore.getState()
    expect(center).toEqual([116.3974, 39.9093])
    expect(zoom).toBe(4)
  })

  it('updates center', () => {
    useMapStore.getState().setCenter([121.47, 31.23])
    expect(useMapStore.getState().center).toEqual([121.47, 31.23])
  })

  it('updates zoom', () => {
    useMapStore.getState().setZoom(10)
    expect(useMapStore.getState().zoom).toBe(10)
  })

  it('updates provider', () => {
    useMapStore.getState().setProvider('google-street')
    expect(useMapStore.getState().provider).toBe('google-street')
  })
})
