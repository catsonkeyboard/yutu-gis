import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import {
  InputNumber, Slider, Select, Radio, Input, Button, Space, Typography, Progress, message
} from 'antd'
import {
  DownloadOutlined, FolderOpenOutlined, CloseOutlined, BorderOutlined, AimOutlined
} from '@ant-design/icons'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTilesPanelStore, type TilesBbox } from '../../stores/tilesPanelStore'
import { getTileUrlTemplate, type MapProvider } from '../MapCanvas/tileProviders'
import { countTiles } from '../../utils/tileMath'
import {
  startTileDownload, getTileTask, cancelTileTask, type TileTaskState
} from '../../services/api'

const { Text } = Typography

const WARN_TILES = 10_000
const MAX_TILES = 200_000 // 与后端 routers/tiles.py MAX_TILES 保持一致

const BBOX_SOURCE = 'tiles-bbox'
const BBOX_FILL = 'tiles-bbox-fill'
const BBOX_LINE = 'tiles-bbox-line'

const SOURCE_OPTIONS: { value: MapProvider | 'custom'; label: string }[] = [
  { value: 'osm', label: 'OSM 街道图' },
  { value: 'google-street', label: 'Google 街道图' },
  { value: 'google-satellite', label: 'Google 卫星图' },
  { value: 'amap-street', label: '高德街道图' },
  { value: 'amap-satellite', label: '高德影像图' },
  { value: 'amap-terrain', label: '高德地形图' },
  { value: 'custom', label: '自定义 URL 模板' }
]

const r6 = (n: number): number => parseFloat(n.toFixed(6))

function timestampName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `tiles-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function bboxToGeoJSON(bbox: TilesBbox): GeoJSON.Feature {
  const [south, west, north, east] = bbox
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, south], [east, south], [east, north], [west, north], [west, south]
      ]]
    }
  }
}

/** Add / update / remove the bbox rectangle overlay on the map. */
function applyBboxOverlay(map: maplibregl.Map, bbox: TilesBbox | null): void {
  if (!bbox) {
    if (map.getLayer(BBOX_FILL)) map.removeLayer(BBOX_FILL)
    if (map.getLayer(BBOX_LINE)) map.removeLayer(BBOX_LINE)
    if (map.getSource(BBOX_SOURCE)) map.removeSource(BBOX_SOURCE)
    return
  }
  const data = bboxToGeoJSON(bbox)
  const src = map.getSource(BBOX_SOURCE) as maplibregl.GeoJSONSource | undefined
  if (src) {
    src.setData(data)
    return
  }
  map.addSource(BBOX_SOURCE, { type: 'geojson', data })
  map.addLayer({
    id: BBOX_FILL,
    type: 'fill',
    source: BBOX_SOURCE,
    paint: { 'fill-color': '#1a6fb5', 'fill-opacity': 0.08 }
  })
  map.addLayer({
    id: BBOX_LINE,
    type: 'line',
    source: BBOX_SOURCE,
    paint: { 'line-color': '#1a6fb5', 'line-width': 2, 'line-dasharray': [2, 2] }
  })
}

interface Props {
  map: maplibregl.Map | null
}

export default function TilesDownloadPanel({ map }: Props) {
  const provider = useMapStore((s) => s.provider)
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
    setSource(provider)
    if (!useTilesPanelStore.getState().bbox) {
      const b = map.getBounds()
      setBbox([r6(b.getSouth()), r6(b.getWest()), r6(b.getNorth()), r6(b.getEast())])
    }
    const z = Math.floor(map.getZoom())
    setZoomRange([Math.max(z, 0), Math.min(z + 3, 19)])
    setPath(defaultPathFor(output))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, map])

  // 地图上渲染 / 更新 / 移除范围矩形（底图切换会重建样式，需要重挂载）
  useEffect(() => {
    if (!map) return
    const apply = () => applyBboxOverlay(map, open ? bbox : null)
    if (map.isStyleLoaded()) apply()
    else map.once('styledata', apply)
  }, [map, bbox, open, provider])

  // 框选模式：暂停地图拖拽，按下-拖动-松开画出矩形
  useEffect(() => {
    if (!map || !selecting) return
    const canvas = map.getCanvas()
    map.dragPan.disable()
    canvas.style.cursor = 'crosshair'
    let start: maplibregl.LngLat | null = null

    const toBbox = (a: maplibregl.LngLat, b: maplibregl.LngLat): TilesBbox => [
      r6(Math.min(a.lat, b.lat)), r6(Math.min(a.lng, b.lng)),
      r6(Math.max(a.lat, b.lat)), r6(Math.max(a.lng, b.lng))
    ]
    const onDown = (e: maplibregl.MapMouseEvent) => { start = e.lngLat }
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (start) setBbox(toBbox(start, e.lngLat))
    }
    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (start) setBbox(toBbox(start, e.lngLat))
      start = null
      setSelecting(false)
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    return () => {
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      map.dragPan.enable()
      canvas.style.cursor = ''
    }
  }, [map, selecting, setBbox, setSelecting])

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

  const updateBboxField = (index: number, value: number | null) => {
    if (!bbox || value === null) return
    const next = [...bbox] as TilesBbox
    next[index] = value
    setBbox(next)
  }

  const handleUseViewport = () => {
    if (!map) return
    const b = map.getBounds()
    setBbox([r6(b.getSouth()), r6(b.getWest()), r6(b.getNorth()), r6(b.getEast())])
  }

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
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 8 }}>
        <Space size={4}>
          <InputNumber size="small" addonBefore="南" value={bbox?.[0]} step={0.01}
            onChange={(v) => updateBboxField(0, v)} style={{ width: 140 }} disabled={running} />
          <InputNumber size="small" addonBefore="北" value={bbox?.[2]} step={0.01}
            onChange={(v) => updateBboxField(2, v)} style={{ width: 140 }} disabled={running} />
        </Space>
        <Space size={4}>
          <InputNumber size="small" addonBefore="西" value={bbox?.[1]} step={0.01}
            onChange={(v) => updateBboxField(1, v)} style={{ width: 140 }} disabled={running} />
          <InputNumber size="small" addonBefore="东" value={bbox?.[3]} step={0.01}
            onChange={(v) => updateBboxField(3, v)} style={{ width: 140 }} disabled={running} />
        </Space>
        <Space size={4}>
          <Button
            size="small"
            icon={<BorderOutlined />}
            type={selecting ? 'primary' : 'default'}
            onClick={() => setSelecting(!selecting)}
            disabled={running}
          >
            {selecting ? '在地图上拖动框选…' : '框选范围'}
          </Button>
          <Button size="small" icon={<AimOutlined />} onClick={handleUseViewport} disabled={running}>
            当前视图
          </Button>
        </Space>
      </Space>

      <div style={labelStyle}>缩放级别 {zoomRange[0]} ~ {zoomRange[1]}</div>
      <Slider range min={0} max={19} value={zoomRange}
        onChange={(v) => setZoomRange(v as [number, number])} disabled={running}
        style={{ marginTop: 0, marginBottom: 12 }} />

      <div style={labelStyle}>瓦片源</div>
      <Select size="small" value={source} options={SOURCE_OPTIONS} onChange={setSource}
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
