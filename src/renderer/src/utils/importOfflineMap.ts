import { nanoid } from 'nanoid'
import { message } from 'antd'
import { useLayerStore } from '../stores/layerStore'
import { useMapStore } from '../stores/mapStore'
import { registerTileSource, getTileSourceUrlTemplate } from '../services/api'

/** Extract FastAPI's {"detail": "..."} message from a thrown error, if present. */
function errorDetail(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  try {
    const parsed = JSON.parse(raw) as { detail?: string }
    return parsed.detail || raw
  } catch {
    return raw
  }
}

/**
 * Import a downloaded offline map (an .mbtiles file or a z/x/y tile directory)
 * as a raster layer. Registers it with the Python tile server, adds the layer,
 * and zooms to its bounds.
 */
export async function importOfflineMap(path: string): Promise<void> {
  try {
    const info = await registerTileSource(path)
    const id = nanoid()
    useLayerStore.getState().addLayer({
      id,
      name: info.name,
      type: 'raster',
      source: {
        tiles: [getTileSourceUrlTemplate(info.source_id)],
        bounds: info.bounds ?? undefined,
        minzoom: info.minzoom,
        maxzoom: info.maxzoom
      },
      visible: true,
      opacity: 1
    })
    useLayerStore.getState().setSelectedLayer(id)
    if (info.bounds) {
      const [west, south, east, north] = info.bounds
      useMapStore.getState().requestFitBounds([
        [west, south],
        [east, north]
      ])
    }
    message.success(`已导入离线地图：${info.name}（z${info.minzoom}~${info.maxzoom}）`)
  } catch (e: unknown) {
    message.error(`导入离线地图失败：${errorDetail(e)}`)
  }
}
