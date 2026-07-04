import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import {
  Slider, Select, Radio, Input, Button, Space, Typography, Progress, message
} from 'antd'
import { DownloadOutlined, FolderOpenOutlined, CloseOutlined } from '@ant-design/icons'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTilesPanelStore } from '../../stores/tilesPanelStore'
import { useMapBboxSelect, viewportBbox } from '../../hooks/useMapBboxSelect'
import BboxSelector from '../common/BboxSelector'
import { getTileUrlTemplate, type MapProvider } from '../MapCanvas/tileProviders'
import { countTiles } from '../../utils/tileMath'
import {
  startTileDownload, getTileTask, cancelTileTask, type TileTaskState
} from '../../services/api'

const { Text } = Typography

const WARN_TILES = 10_000
const MAX_TILES = 200_000 // 与后端 routers/tiles.py MAX_TILES 保持一致

const SOURCE_OPTIONS: { value: MapProvider | 'custom'; label: string }[] = [
  { value: 'osm', label: 'OSM 街道图' },
  { value: 'google-street', label: 'Google 街道图' },
  { value: 'google-satellite', label: 'Google 卫星图' },
  { value: 'amap-street', label: '高德街道图' },
  { value: 'amap-satellite', label: '高德影像图' },
  { value: 'amap-terrain', label: '高德地形图' },
  { value: 'custom', label: '自定义 URL 模板' }
]

function timestampName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `tiles-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

interface Props {
  map: maplibregl.Map | null
}

export default function TilesDownloadPanel({ map }: Props) {
  const provider = useMapStore((s) => s.provider)
  const setProvider = useMapStore((s) => s.setProvider)
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const downloadDir = useSettingsStore((s) => s.downloadDir)

  const open = useTilesPanelStore((s) => s.open)
  const bbox = useTilesPanelStore((s) => s.bbox)
  const selecting = useTilesPanelStore((s) => s.selecting)
  const setOpen = useTilesPanelStore((s) => s.setOpen)
  const setBbox = useTilesPanelStore((s) => s.setBbox)
  const setSelecting = useTilesPanelStore((s) => s.setSelecting)

  const [zoomRange, setZoomRange] = useState<[number, number]>([10, 14])
  const [source, setSource] = useState<MapProvider | 'custom'>('osm')
  const [customTemplate, setCustomTemplate] = useState('')
  const [output, setOutput] = useState<'mbtiles' | 'directory'>('mbtiles')
  const [path, setPath] = useState('')

  const [task, setTask] = useState<TileTaskState | null>(null)
  const [starting, setStarting] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const defaultPathFor = (fmt: 'mbtiles' | 'directory'): string => {
    if (!downloadDir) return ''
    const base = `${downloadDir}/${timestampName()}`
    return fmt === 'mbtiles' ? `${base}.mbtiles` : base
  }

  // 打开面板：默认范围取当前视图（右键菜单打开时已预设 bbox 则保留），
  // 缩放区间从当前地图缩放推算，并预填默认下载路径
  useEffect(() => {
    if (!open || !map) return
    if (!useTilesPanelStore.getState().bbox) {
      setBbox(viewportBbox(map))
    }
    const z = Math.floor(map.getZoom())
    setZoomRange([Math.max(z, 0), Math.min(z + 3, 19)])
    setPath(defaultPathFor(output))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, map])

  // 面板选择瓦片源 → 地图底图跟随，所见即所下
  const handleSourceChange = (v: MapProvider | 'custom') => {
    setSource(v)
    if (v !== 'custom') setProvider(v)
  }

  // 反向同步：面板开着时用底图切换器换图，面板选择跟随（自定义模板除外）
  useEffect(() => {
    if (!open) return
    setSource((cur) => (cur === 'custom' ? cur : provider))
  }, [open, provider])

  // 地图上的范围矩形 + 框选交互（与 OSM 提取面板共用同一套机制）
  useMapBboxSelect({
    map, active: open, bbox, selecting, setBbox, setSelecting,
    sourceId: 'tiles-bbox', color: '#1a6fb5', provider
  })

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }
  useEffect(() => stopPolling, [])

  const urlTemplate =
    source === 'custom' ? customTemplate.trim() : getTileUrlTemplate(source, apiKeys)

  const estimate = useMemo(() => {
    if (!bbox) return 0
    const [south, west, north, east] = bbox
    if (south >= north || west >= east) return 0
    return countTiles(south, west, north, east, zoomRange[0], zoomRange[1])
  }, [bbox, zoomRange])

  const running = task?.status === 'running'
  const canStart =
    !running && !starting && estimate > 0 && estimate <= MAX_TILES &&
    path !== '' && urlTemplate.includes('{z}')

  const handlePickPath = async () => {
    if (output === 'mbtiles') {
      const p = await window.electronAPI.saveFileDialog(
        [{ name: 'MBTiles', extensions: ['mbtiles'] }],
        path || defaultPathFor('mbtiles')
      )
      if (p) setPath(p)
    } else {
      const p = await window.electronAPI.openDirectoryDialog(downloadDir || undefined)
      if (p) setPath(p)
    }
  }

  const handleStart = async () => {
    if (!bbox) return
    const [south, west, north, east] = bbox
    setStarting(true)
    setTask(null)
    try {
      const { task_id } = await startTileDownload({
        south, west, north, east,
        min_zoom: zoomRange[0], max_zoom: zoomRange[1],
        url_template: urlTemplate,
        output, path,
        name: path.split('/').pop()?.replace(/\.mbtiles$/, '') || 'tiles'
      })
      pollTimer.current = setInterval(async () => {
        try {
          const state = await getTileTask(task_id)
          setTask(state)
          if (state.status !== 'running') {
            stopPolling()
            if (state.status === 'completed') {
              message.success(
                `下载完成：成功 ${state.done}，跳过 ${state.skipped}，失败 ${state.failed}`
              )
            } else if (state.status === 'cancelled') {
              message.info('下载已取消，已下载的瓦片已保留（重新开始会自动跳过）')
            } else {
              message.error(`下载出错：${state.message}`)
            }
          }
        } catch {
          // 单次轮询失败忽略，下个周期重试
        }
      }, 500)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const handleCancelTask = async () => {
    if (task && running) {
      try {
        await cancelTileTask(task.task_id)
      } catch {
        // 任务可能刚好已结束
      }
    }
  }

  const handleClose = () => {
    if (running) {
      message.warning('下载进行中，请先取消或等待完成')
      return
    }
    stopPolling()
    setTask(null)
    setOpen(false)
  }

  if (!open) return null

  const progressPercent = task && task.total > 0
    ? Math.round(((task.done + task.failed + task.skipped) / task.total) * 100)
    : 0

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#646a73', marginBottom: 4 }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 316,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 600,
        padding: '10px 14px 14px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <Text strong style={{ flex: 1, fontSize: 13 }}>
          <DownloadOutlined style={{ marginRight: 6 }} />
          下载地图瓦片
        </Text>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleClose} />
      </div>

      <div style={labelStyle}>范围（WGS-84）</div>
      <div style={{ marginBottom: 8 }}>
        <BboxSelector
          bbox={bbox}
          onChange={setBbox}
          selecting={selecting}
          onToggleSelecting={() => setSelecting(!selecting)}
          onUseViewport={() => map && setBbox(viewportBbox(map))}
          disabled={running}
        />
      </div>

      <div style={labelStyle}>缩放级别 {zoomRange[0]} ~ {zoomRange[1]}</div>
      <Slider range min={0} max={19} value={zoomRange}
        onChange={(v) => setZoomRange(v as [number, number])} disabled={running}
        style={{ marginTop: 0, marginBottom: 12 }} />

      <div style={labelStyle}>瓦片源</div>
      <Select size="small" value={source} options={SOURCE_OPTIONS} onChange={handleSourceChange}
        disabled={running} style={{ width: '100%', marginBottom: 8 }} />

      {source === 'custom' && (
        <>
          <div style={labelStyle}>URL 模板（须包含 {'{z} {x} {y}'}）</div>
          <Input size="small" placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
            value={customTemplate} onChange={(e) => setCustomTemplate(e.target.value)}
            disabled={running} style={{ marginBottom: 8 }} />
        </>
      )}

      <div style={labelStyle}>输出格式</div>
      <Radio.Group
        size="small"
        value={output}
        onChange={(e) => { setOutput(e.target.value); setPath(defaultPathFor(e.target.value)) }}
        disabled={running}
        style={{ marginBottom: 8 }}
      >
        <Radio.Button value="mbtiles">MBTiles 文件</Radio.Button>
        <Radio.Button value="directory">z/x/y 目录</Radio.Button>
      </Radio.Group>

      <div style={labelStyle}>保存位置</div>
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Input size="small" value={path} readOnly placeholder="点击右侧按钮选择" />
        <Button size="small" icon={<FolderOpenOutlined />} onClick={handlePickPath} disabled={running} />
      </Space.Compact>

      <div style={{ marginBottom: 10 }}>
        <Text
          type={estimate > MAX_TILES ? 'danger' : estimate > WARN_TILES ? 'warning' : 'secondary'}
          style={{ fontSize: 12 }}
        >
          预计 {estimate.toLocaleString()} 张瓦片
          {estimate > MAX_TILES && ` — 超过上限 ${MAX_TILES.toLocaleString()}，请缩小范围或降低级别`}
          {estimate > WARN_TILES && estimate <= MAX_TILES && ' — 数量较大，下载可能较慢'}
        </Text>
      </div>

      {task && (
        <div style={{ marginBottom: 10 }}>
          <Progress
            percent={progressPercent}
            size="small"
            status={task.status === 'error' ? 'exception' : task.status === 'completed' ? 'success' : 'active'}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            成功 {task.done} / 跳过 {task.skipped} / 失败 {task.failed} / 共 {task.total}
          </Text>
        </div>
      )}

      {running ? (
        <Button danger size="small" onClick={handleCancelTask} style={{ width: '100%' }}>
          取消下载
        </Button>
      ) : (
        <Button
          type="primary"
          size="small"
          icon={<DownloadOutlined />}
          loading={starting}
          disabled={!canStart}
          onClick={handleStart}
          style={{ width: '100%' }}
        >
          开始下载
        </Button>
      )}
    </div>
  )
}
