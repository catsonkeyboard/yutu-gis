import { describe, it, expect, beforeEach, vi } from 'vitest'
import { serializeProject, loadProject, PROJECT_VERSION } from '../project'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'

vi.mock('../api', () => ({
  registerTileSource: vi.fn(async (path: string) => {
    if (path.includes('missing')) throw new Error('not found')
    return {
      source_id: 'abc123',
      name: 'tiles',
      format: 'png',
      bounds: [100, 30, 110, 40],
      minzoom: 0,
      maxzoom: 10,
    }
  }),
  getTileSourceUrlTemplate: (id: string) => `http://127.0.0.1:1/tiles/sources/${id}/{z}/{x}/{y}`,
}))

const FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { a: 1 } },
  ],
}

describe('project serialize/load', () => {
  beforeEach(() => {
    useLayerStore.getState().reset()
    useMapStore.getState().reset()
  })

  it('round-trips geojson layers with styles and map state', async () => {
    const layerStore = useLayerStore.getState()
    layerStore.addLayer({ id: 'l1', name: '底层', type: 'geojson', source: FC, visible: true, opacity: 0.7 })
    layerStore.addLayer({
      id: 'l2',
      name: '顶层',
      type: 'geojson',
      source: FC,
      visible: false,
      opacity: 1,
      style: {
        mode: 'single', fillColor: '#123456', strokeColor: '#654321',
        strokeWidth: 2, pointRadius: 8, fillOpacity: 0.3,
      },
    })
    useMapStore.getState().setProvider('google-satellite')
    useMapStore.getState().setCenter([120, 30])
    useMapStore.getState().setZoom(9)

    const project = serializeProject()
    expect(project.app).toBe('yutugis-project')
    expect(project.version).toBe(PROJECT_VERSION)
    expect(project.layers).toHaveLength(2)

    useLayerStore.getState().reset()
    useMapStore.getState().reset()

    const { warnings } = await loadProject(project)
    expect(warnings).toEqual([])
    const layers = useLayerStore.getState().layers
    expect(layers).toHaveLength(2)
    // Order preserved: '顶层' first (topmost), same as before saving
    expect(layers[0].name).toBe('顶层')
    expect(layers[0].visible).toBe(false)
    expect(layers[0].style?.fillColor).toBe('#123456')
    expect(layers[1].opacity).toBe(0.7)
    expect(useMapStore.getState().provider).toBe('google-satellite')
    expect(useMapStore.getState().jumpToRequest?.center).toEqual([120, 30])
    expect(useMapStore.getState().jumpToRequest?.zoom).toBe(9)
  })

  it('re-registers raster layers from sourcePath', async () => {
    useLayerStore.getState().addLayer({
      id: 'r1', name: '离线图', type: 'raster', sourcePath: '/data/a.mbtiles',
      source: { tiles: ['http://old'], bounds: [100, 30, 110, 40], minzoom: 0, maxzoom: 10 },
      visible: true, opacity: 0.9,
    })
    const project = serializeProject()
    useLayerStore.getState().reset()

    const { warnings } = await loadProject(project)
    expect(warnings).toEqual([])
    const layer = useLayerStore.getState().layers[0]
    expect(layer.type).toBe('raster')
    expect(layer.sourcePath).toBe('/data/a.mbtiles')
    expect((layer.source as { tiles: string[] }).tiles[0]).toContain('abc123')
  })

  it('collects warnings for missing raster files and keeps other layers', async () => {
    useLayerStore.getState().addLayer({
      id: 'r1', name: '丢失的图', type: 'raster', sourcePath: '/data/missing.mbtiles',
      source: { tiles: [] }, visible: true, opacity: 1,
    })
    useLayerStore.getState().addLayer({
      id: 'l1', name: '矢量', type: 'geojson', source: FC, visible: true, opacity: 1,
    })
    const project = serializeProject()
    useLayerStore.getState().reset()

    const { warnings } = await loadProject(project)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('丢失的图')
    expect(useLayerStore.getState().layers).toHaveLength(1)
  })

  it('rejects non-project json and newer versions', async () => {
    await expect(loadProject({ foo: 1 })).rejects.toThrow()
    await expect(
      loadProject({ app: 'yutugis-project', version: 99, map: {}, layers: [] })
    ).rejects.toThrow()
  })
})
