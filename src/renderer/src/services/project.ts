import { useLayerStore, type Layer, type LayerStyle } from '../stores/layerStore'
import { useMapStore, type MapProvider } from '../stores/mapStore'
import {
  registerTileSource,
  getTileSourceUrlTemplate,
  registerGeoTiff,
  getGeoTiffUrlTemplate,
} from './api'

export const PROJECT_VERSION = 1

interface ProjectGeojsonLayer {
  kind: 'geojson'
  id: string
  name: string
  visible: boolean
  opacity: number
  style?: LayerStyle
  source: GeoJSON.FeatureCollection
}

interface ProjectRasterLayer {
  kind: 'raster'
  id: string
  name: string
  visible: boolean
  opacity: number
  path: string
}

export interface ProjectFile {
  app: 'yutugis-project'
  version: number
  savedAt: string
  map: { center: [number, number]; zoom: number; provider: MapProvider }
  layers: (ProjectGeojsonLayer | ProjectRasterLayer)[]
}

/** Snapshot the current workspace (layers + styles + camera) as a project object. */
export function serializeProject(): ProjectFile {
  const { layers } = useLayerStore.getState()
  const { center, zoom, provider } = useMapStore.getState()

  const projectLayers: (ProjectGeojsonLayer | ProjectRasterLayer)[] = []
  for (const l of layers) {
    if (l.type === 'geojson') {
      projectLayers.push({
        kind: 'geojson',
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        ...(l.style ? { style: l.style } : {}),
        source: l.source as GeoJSON.FeatureCollection,
      })
    } else if (l.type === 'raster' && l.sourcePath) {
      projectLayers.push({
        kind: 'raster',
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        path: l.sourcePath,
      })
    }
    // raster layers without a sourcePath cannot be restored — dropped on save
  }

  return {
    app: 'yutugis-project',
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    map: { center, zoom, provider },
    layers: projectLayers,
  }
}

/**
 * Replace the current workspace with a saved project.
 * Returns warnings for layers that could not be restored (missing raster files).
 * Throws on invalid/newer project files.
 */
export async function loadProject(json: unknown): Promise<{ warnings: string[] }> {
  const project = json as ProjectFile
  if (!project || project.app !== 'yutugis-project' || !Array.isArray(project.layers)) {
    throw new Error('不是有效的舆图工程文件')
  }
  if (typeof project.version !== 'number' || project.version > PROJECT_VERSION) {
    throw new Error('工程文件版本过新，请升级应用后打开')
  }

  const warnings: string[] = []
  const restored: Layer[] = []

  for (const pl of project.layers) {
    if (pl.kind === 'geojson') {
      restored.push({
        id: pl.id,
        name: pl.name,
        type: 'geojson',
        source: pl.source,
        visible: pl.visible,
        opacity: pl.opacity,
        ...(pl.style ? { style: pl.style } : {}),
      })
    } else if (pl.kind === 'raster') {
      try {
        // GeoTIFF imagery and offline maps (MBTiles/tile dirs) re-register
        // through different endpoints — dispatch by file extension
        const source = /\.tiff?$/i.test(pl.path)
          ? await registerGeoTiff(pl.path).then((info) => ({
              tiles: [getGeoTiffUrlTemplate(info.id)],
              bounds: info.bounds as [number, number, number, number] | undefined,
              minzoom: info.minzoom,
              maxzoom: info.maxzoom,
            }))
          : await registerTileSource(pl.path).then((info) => ({
              tiles: [getTileSourceUrlTemplate(info.source_id)],
              bounds: info.bounds ?? undefined,
              minzoom: info.minzoom,
              maxzoom: info.maxzoom,
            }))
        restored.push({
          id: pl.id,
          name: pl.name,
          type: 'raster',
          sourcePath: pl.path,
          source,
          visible: pl.visible,
          opacity: pl.opacity,
        })
      } catch {
        warnings.push(`栅格图层「${pl.name}」无法恢复（${pl.path}）`)
      }
    }
  }

  const layerStore = useLayerStore.getState()
  layerStore.reset()
  // addLayer prepends — iterate bottom-up so the saved order is preserved
  for (let i = restored.length - 1; i >= 0; i--) {
    layerStore.addLayer(restored[i])
  }

  const mapStore = useMapStore.getState()
  if (project.map?.provider) mapStore.setProvider(project.map.provider)
  if (project.map?.center && typeof project.map.zoom === 'number') {
    mapStore.setCenter(project.map.center)
    mapStore.setZoom(project.map.zoom)
    mapStore.requestJumpTo(project.map.center, project.map.zoom)
  }

  return { warnings }
}
