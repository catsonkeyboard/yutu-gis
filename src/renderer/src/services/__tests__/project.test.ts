import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  serializeProject,
  loadProject,
  saveProject,
  fcToBlob,
  loadLazyLayers,
  PROJECT_VERSION,
  INLINE_FEATURE_MAX,
} from '../project'
import { saveProjectFile, copyProjectFile, readProjectFile, cleanupProjectFiles } from '../api'
import { useLayerStore, type Layer } from '../../stores/layerStore'
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
  saveProjectFile: vi.fn(async () => {}),
  copyProjectFile: vi.fn(async () => {}),
  readProjectFile: vi.fn(async (_path: string) => {
    throw new Error('not stubbed')
  }),
  cleanupProjectFiles: vi.fn(async () => 0),
}))

const FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { a: 1 } },
  ],
}

function points(n: number): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: n }, (_, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [i, i] },
      properties: { i },
    })),
  }
}

// Layer.source is typed `object` in the store; every geojson layer holds an FC.
function fcOf(layer: Layer): GeoJSON.FeatureCollection {
  return layer.source as GeoJSON.FeatureCollection
}

// window.electronAPI is injected by the preload script at runtime; vitest runs
// in a node environment, so stub the global for saveProject tests.
const writeFileMock = vi.fn(async (_path: string, _content: string) => {})
function stubElectron() {
  vi.stubGlobal('window', { electronAPI: { writeFile: writeFileMock } })
}

describe('project serialize/load', () => {
  beforeEach(() => {
    useLayerStore.getState().reset()
    useMapStore.getState().reset()
    writeFileMock.mockClear()
    vi.mocked(readProjectFile).mockReset()
    vi.mocked(readProjectFile).mockRejectedValue(new Error('not stubbed'))
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
    const tiles = (layer.source as { tiles: string[] }).tiles
    expect(tiles[0]).toContain('abc123')
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

describe('sidecar serialize (v2)', () => {
  beforeEach(() => {
    useLayerStore.getState().reset()
    useMapStore.getState().reset()
  })

  it('moves big layers to sourceFile and keeps small ones inline', () => {
    useLayerStore.getState().addLayer({
      id: 'big1', name: '大层', type: 'geojson', source: points(INLINE_FEATURE_MAX + 1),
      visible: true, opacity: 1,
    })
    useLayerStore.getState().addLayer({
      id: 'small', name: '小层', type: 'geojson', source: FC, visible: true, opacity: 1,
    })

    const project = serializeProject('/w/demo.yutugis')
    expect(project.filesDir).toBe('demo.files')
    const big = project.layers.find((l) => l.id === 'big1') as { sourceFile?: string; source?: unknown }
    const small = project.layers.find((l) => l.id === 'small') as { sourceFile?: string; source?: unknown }
    expect(big.sourceFile).toBe('big1.geojson')
    expect(big.source).toBeUndefined()
    expect(small.sourceFile).toBeUndefined()
    expect(small.source).toBeDefined()
  })

  it('omits filesDir when there are no sidecar layers', () => {
    useLayerStore.getState().addLayer({
      id: 'l1', name: '小', type: 'geojson', source: FC, visible: true, opacity: 1,
    })
    expect(serializeProject('/w/demo.yutugis').filesDir).toBeUndefined()
  })
})

describe('fcToBlob', () => {
  it('is byte-identical to JSON.stringify across the chunk boundary', async () => {
    const fc = points(INLINE_FEATURE_MAX + 1) // crosses the 2000-feature yield
    const blob = await fcToBlob(fc)
    expect(await blob.text()).toBe(JSON.stringify(fc))
  })
})

describe('sidecar load (v2)', () => {
  const baseProject = {
    app: 'yutugis-project' as const,
    version: 2,
    savedAt: '',
    map: { center: [0, 0] as [number, number], zoom: 1, provider: 'osm' as const },
    filesDir: 'demo.files',
    layers: [
      { kind: 'geojson' as const, id: 'a', name: '可见大层', visible: true, opacity: 1, sourceFile: 'a.geojson' },
      { kind: 'geojson' as const, id: 'b', name: '隐藏大层', visible: false, opacity: 1, sourceFile: 'b.geojson' },
      { kind: 'geojson' as const, id: 'c', name: '小层', visible: true, opacity: 1, source: FC },
    ],
  }

  beforeEach(() => {
    useLayerStore.getState().reset()
    useMapStore.getState().reset()
    vi.mocked(readProjectFile).mockReset()
    vi.mocked(readProjectFile).mockRejectedValue(new Error('not stubbed'))
  })

  it('fetches visible sidecar layers and defers hidden ones as lazy placeholders', async () => {
    vi.mocked(readProjectFile).mockImplementation(async (p) => {
      if (p.includes('a.geojson')) return points(3)
      throw new Error('unexpected fetch')
    })

    const { warnings } = await loadProject(baseProject, '/x/demo.yutugis')
    expect(warnings).toEqual([])

    const layers = useLayerStore.getState().layers
    expect(layers.map((l) => l.name)).toEqual(['可见大层', '隐藏大层', '小层'])
    expect(fcOf(layers[0]).features).toHaveLength(3)
    expect(layers[0].lazy).toBeUndefined()
    // hidden sidecar layer: empty placeholder, no request issued
    expect(fcOf(layers[1]).features).toHaveLength(0)
    expect(layers[1].lazy).toEqual({ path: '/x/demo.files/b.geojson' })
    expect(layers[1].sourcePath).toBe('/x/demo.files/b.geojson')
    expect(layers[2].source).toBe(FC)
    expect(vi.mocked(readProjectFile).mock.calls.every(([p]) => p.includes('a.geojson'))).toBe(true)
  })

  it('warns and skips a visible layer whose sidecar file is missing', async () => {
    vi.mocked(readProjectFile).mockRejectedValue(new Error('404'))
    const { warnings } = await loadProject(baseProject, '/x/demo.yutugis')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('可见大层')
    expect(useLayerStore.getState().layers.map((l) => l.name)).toEqual(['隐藏大层', '小层'])
  })

  it('warns when a sidecar project is loaded without a project path', async () => {
    const { warnings } = await loadProject(baseProject)
    expect(warnings).toHaveLength(2) // both sidecar layers unresolvable
    expect(useLayerStore.getState().layers.map((l) => l.name)).toEqual(['小层'])
  })
})

describe('saveProject (sidecar + incremental)', () => {
  beforeEach(() => {
    useLayerStore.getState().reset()
    useMapStore.getState().reset()
    vi.mocked(saveProjectFile).mockClear()
    vi.mocked(copyProjectFile).mockClear()
    vi.mocked(cleanupProjectFiles).mockClear()
    vi.mocked(readProjectFile).mockReset()
    vi.mocked(readProjectFile).mockRejectedValue(new Error('not stubbed'))
    writeFileMock.mockClear()
    stubElectron()
  })

  it('writes big layers as sidecar files, metadata inline for the rest', async () => {
    useLayerStore.getState().addLayer({
      id: 'big1', name: '大层', type: 'geojson', source: points(INLINE_FEATURE_MAX + 1),
      visible: true, opacity: 1,
    })
    useLayerStore.getState().addLayer({
      id: 'small', name: '小层', type: 'geojson', source: FC, visible: true, opacity: 1,
    })

    await saveProject('/w/demo.yutugis')

    const calls = vi.mocked(saveProjectFile).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/w/demo.files/big1.geojson')
    expect(vi.mocked(cleanupProjectFiles).mock.calls[0]).toEqual([
      '/w/demo.files',
      ['big1.geojson'],
    ])

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const meta = JSON.parse(writeFileMock.mock.calls[0][1]) as {
      filesDir?: string
      layers: { id: string; sourceFile?: string; source?: unknown }[]
    }
    expect(meta.filesDir).toBe('demo.files')
    expect(meta.layers.find((l) => l.id === 'big1')?.sourceFile).toBe('big1.geojson')
    expect(meta.layers.find((l) => l.id === 'small')?.source).toBeDefined()
  })

  it('skips unchanged layers on re-save to the same path', async () => {
    useLayerStore.getState().addLayer({
      id: 'big1', name: '大层', type: 'geojson', source: points(INLINE_FEATURE_MAX + 1),
      visible: true, opacity: 1,
    })
    await saveProject('/w/one.yutugis')
    await saveProject('/w/one.yutugis')
    expect(vi.mocked(saveProjectFile)).toHaveBeenCalledTimes(1)

    // saving to a different path must rewrite everything
    await saveProject('/w/two.yutugis')
    expect(vi.mocked(saveProjectFile)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(saveProjectFile).mock.calls[1][0]).toBe('/w/two.files/big1.geojson')
  })

  it('rewrites a layer after setSource bumps its version', async () => {
    useLayerStore.getState().addLayer({
      id: 'big1', name: '大层', type: 'geojson', source: points(INLINE_FEATURE_MAX + 1),
      visible: true, opacity: 1,
    })
    await saveProject('/w/one.yutugis')
    useLayerStore.getState().setSource('big1', points(INLINE_FEATURE_MAX + 2))
    await saveProject('/w/one.yutugis')
    expect(vi.mocked(saveProjectFile)).toHaveBeenCalledTimes(2)
  })

  it('prefers server-side copy for hashed layers (zero upload)', async () => {
    useLayerStore.getState().addLayer({
      id: 'big1', name: '大层', type: 'geojson', source: points(INLINE_FEATURE_MAX + 1),
      visible: true, opacity: 1, contentHash: 'abc123',
    })
    await saveProject('/w/demo.yutugis')
    expect(vi.mocked(copyProjectFile).mock.calls[0]).toEqual(['/w/demo.files/big1.geojson', 'abc123'])
    expect(vi.mocked(saveProjectFile)).not.toHaveBeenCalled()
  })

  it('falls back to blob upload when the copy misses the store', async () => {
    vi.mocked(copyProjectFile).mockRejectedValueOnce(new Error('404'))
    useLayerStore.getState().addLayer({
      id: 'big1', name: '大层', type: 'geojson', source: points(INLINE_FEATURE_MAX + 1),
      visible: true, opacity: 1, contentHash: 'abc123',
    })
    await saveProject('/w/demo.yutugis')
    expect(vi.mocked(copyProjectFile)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProjectFile)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveProjectFile).mock.calls[0][0]).toBe('/w/demo.files/big1.geojson')
  })

  it('does not rewrite layers right after loadProject (versions seeded)', async () => {
    vi.mocked(readProjectFile).mockResolvedValue(points(INLINE_FEATURE_MAX + 1))
    await loadProject(
      {
        app: 'yutugis-project',
        version: 2,
        savedAt: '',
        map: { center: [0, 0] as [number, number], zoom: 1, provider: 'osm' as const },
        filesDir: 'demo.files',
        layers: [
          { kind: 'geojson', id: 'a', name: '可见大层', visible: true, opacity: 1, sourceFile: 'a.geojson' },
        ],
      },
      '/x/demo.yutugis'
    )
    await saveProject('/x/demo.yutugis')
    expect(vi.mocked(saveProjectFile)).not.toHaveBeenCalled()
    expect(vi.mocked(cleanupProjectFiles).mock.calls[0]).toEqual([
      '/x/demo.files',
      ['a.geojson'],
    ])
  })
})

describe('loadLazyLayers', () => {
  beforeEach(() => {
    useLayerStore.getState().reset()
    vi.mocked(readProjectFile).mockReset()
    vi.mocked(readProjectFile).mockRejectedValue(new Error('not stubbed'))
  })

  it('fills the source and clears the lazy marker for visible placeholders', async () => {
    useLayerStore.getState().addLayer({
      id: 'b', name: '隐藏大层', type: 'geojson',
      source: { type: 'FeatureCollection', features: [] },
      visible: true, opacity: 1,
      lazy: { path: '/x/demo.files/b.geojson' },
    })
    vi.mocked(readProjectFile).mockResolvedValue(points(2))

    const { failed } = await loadLazyLayers(useLayerStore.getState().layers)
    expect(failed).toEqual([])
    const layer = useLayerStore.getState().layers[0]
    expect(layer.lazy).toBeUndefined()
    expect(fcOf(layer).features).toHaveLength(2)
  })

  it('keeps the placeholder on failure so toggling visibility retries', async () => {
    useLayerStore.getState().addLayer({
      id: 'b', name: '隐藏大层', type: 'geojson',
      source: { type: 'FeatureCollection', features: [] },
      visible: true, opacity: 1,
      lazy: { path: '/x/demo.files/b.geojson' },
    })
    vi.mocked(readProjectFile).mockRejectedValue(new Error('boom'))

    const { failed } = await loadLazyLayers(useLayerStore.getState().layers)
    expect(failed[0]).toMatchObject({ id: 'b', name: '隐藏大层' })
    const layer = useLayerStore.getState().layers[0]
    expect(layer.lazy).toEqual({ path: '/x/demo.files/b.geojson' })
    expect(fcOf(layer).features).toHaveLength(0)
  })

  it('ignores layers that are hidden or not lazy', async () => {
    useLayerStore.getState().addLayer({
      id: 'h', name: '隐藏', type: 'geojson', source: FC, visible: false, opacity: 1,
      lazy: { path: '/x/h.geojson' },
    })
    useLayerStore.getState().addLayer({
      id: 'n', name: '普通', type: 'geojson', source: FC, visible: true, opacity: 1,
    })
    await loadLazyLayers(useLayerStore.getState().layers)
    expect(vi.mocked(readProjectFile)).not.toHaveBeenCalled()
  })
})
