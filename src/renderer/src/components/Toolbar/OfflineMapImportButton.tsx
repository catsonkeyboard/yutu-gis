import { Button, Dropdown, Tooltip, message } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'
import { nanoid } from 'nanoid'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { registerTileSource, getTileSourceUrlTemplate } from '../../services/api'

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

export default function OfflineMapImportButton() {
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const downloadDir = useSettingsStore((s) => s.downloadDir)

  const importPath = async (path: string) => {
    try {
      const info = await registerTileSource(path)
      const id = nanoid()
      addLayer({
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
      setSelectedLayer(id)
      if (info.bounds) {
        const [west, south, east, north] = info.bounds
        requestFitBounds([
          [west, south],
          [east, north]
        ])
      }
      message.success(`已导入离线地图：${info.name}（z${info.minzoom}~${info.maxzoom}）`)
    } catch (e: unknown) {
      message.error(`导入失败：${errorDetail(e)}`)
    }
  }

  const handleMbtiles = async () => {
    const path = await window.electronAPI.openFileDialog([
      { name: 'MBTiles', extensions: ['mbtiles'] }
    ])
    if (path) await importPath(path)
  }

  const handleDirectory = async () => {
    const path = await window.electronAPI.openDirectoryDialog(downloadDir || undefined)
    if (path) await importPath(path)
  }

  return (
    <Dropdown
      menu={{
        items: [
          { key: 'mbtiles', label: 'MBTiles 文件' },
          { key: 'directory', label: '瓦片目录（z/x/y）' }
        ],
        onClick: ({ key }) => {
          if (key === 'mbtiles') void handleMbtiles()
          else void handleDirectory()
        }
      }}
      trigger={['click']}
    >
      <Tooltip title="导入离线地图">
        <Button icon={<GlobalOutlined />} type="text" size="small" />
      </Tooltip>
    </Dropdown>
  )
}
