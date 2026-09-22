import { nanoid } from 'nanoid'
import { message } from './toaster'
import { useLayerStore } from '../stores/layerStore'
import { useMapStore } from '../stores/mapStore'
import { registerGeoTiff, getGeoTiffUrlTemplate, parseApiError } from '../services/api'

/**
 * Import a local GeoTIFF/COG as a raster layer: register it with the Python
 * backend (dynamic tile rendering), add the layer, and zoom to its bounds.
 */
export async function importGeoTiff(path: string): Promise<void> {
  try {
    const info = await registerGeoTiff(path)
    const id = nanoid()
    useLayerStore.getState().addLayer({
      id,
      name: info.name,
      type: 'raster',
      sourcePath: path,
      source: {
        tiles: [getGeoTiffUrlTemplate(info.id)],
        bounds: info.bounds,
        minzoom: info.minzoom,
        maxzoom: info.maxzoom,
      },
      visible: true,
      opacity: 1,
    })
    useLayerStore.getState().setSelectedLayer(id)
    const [west, south, east, north] = info.bounds
    useMapStore.getState().requestFitBounds([
      [west, south],
      [east, north],
    ])
    if (!info.has_overviews) {
      message.warning('该 GeoTIFF 没有金字塔概览，低层级缩放渲染较慢，建议转换为 COG')
    }
    message.success(`已导入影像：${info.name}`)
  } catch (e: unknown) {
    message.error(`导入 GeoTIFF 失败：${parseApiError(e)}`)
  }
}
