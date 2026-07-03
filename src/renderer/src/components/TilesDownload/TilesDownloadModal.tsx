import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal, Form, InputNumber, Slider, Select, Radio, Input, Button, Space,
  Typography, Progress, message
} from 'antd'
import { DownloadOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
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

interface Props {
  open: boolean
  bounds: [number, number, number, number] | null // [south, west, north, east]
  onClose: () => void
}

export default function TilesDownloadModal({ open, bounds, onClose }: Props) {
  const provider = useMapStore((s) => s.provider)
  const apiKeys = useSettingsStore((s) => s.apiKeys)

  const [south, setSouth] = useState(0)
  const [west, setWest] = useState(0)
  const [north, setNorth] = useState(0)
  const [east, setEast] = useState(0)
  const [zoomRange, setZoomRange] = useState<[number, number]>([10, 14])
  const [source, setSource] = useState<MapProvider | 'custom'>('osm')
  const [customTemplate, setCustomTemplate] = useState('')
  const [output, setOutput] = useState<'mbtiles' | 'directory'>('mbtiles')
  const [path, setPath] = useState('')

  const [task, setTask] = useState<TileTaskState | null>(null)
  const [starting, setStarting] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 打开时用右键捕获的视图范围和当前底图初始化表单
  useEffect(() => {
    if (open && bounds) {
      setSouth(parseFloat(bounds[0].toFixed(6)))
      setWest(parseFloat(bounds[1].toFixed(6)))
      setNorth(parseFloat(bounds[2].toFixed(6)))
      setEast(parseFloat(bounds[3].toFixed(6)))
      setSource(provider)
    }
  }, [open, bounds, provider])

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
    if (south >= north || west >= east) return 0
    return countTiles(south, west, north, east, zoomRange[0], zoomRange[1])
  }, [south, west, north, east, zoomRange])

  const running = task?.status === 'running'
  const canStart =
    !running && !starting && estimate > 0 && estimate <= MAX_TILES &&
    path !== '' && urlTemplate.includes('{z}')

  const handlePickPath = async () => {
    if (output === 'mbtiles') {
      const p = await window.electronAPI.saveFileDialog([
        { name: 'MBTiles', extensions: ['mbtiles'] }
      ])
      if (p) setPath(p)
    } else {
      const p = await window.electronAPI.openDirectoryDialog()
      if (p) setPath(p)
    }
  }

  const handleStart = async () => {
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

  const handleCancel = async () => {
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
    setPath('')
    onClose()
  }

  const progressPercent = task && task.total > 0
    ? Math.round(((task.done + task.failed + task.skipped) / task.total) * 100)
    : 0

  return (
    <Modal
      title="下载地图瓦片"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={520}
      maskClosable={false}
    >
      <Form layout="vertical" size="small">
        <Form.Item label="范围（WGS-84，来自右键时的地图视图，可微调）" style={{ marginBottom: 8 }}>
          <Space wrap>
            <InputNumber addonBefore="南" value={south} onChange={(v) => setSouth(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
            <InputNumber addonBefore="北" value={north} onChange={(v) => setNorth(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
            <InputNumber addonBefore="西" value={west} onChange={(v) => setWest(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
            <InputNumber addonBefore="东" value={east} onChange={(v) => setEast(v ?? 0)} step={0.01} style={{ width: 150 }} disabled={running} />
          </Space>
        </Form.Item>

        <Form.Item label={`缩放级别 ${zoomRange[0]} ~ ${zoomRange[1]}`} style={{ marginBottom: 8 }}>
          <Slider range min={0} max={19} value={zoomRange} onChange={(v) => setZoomRange(v as [number, number])} disabled={running} />
        </Form.Item>

        <Form.Item label="瓦片源" style={{ marginBottom: 8 }}>
          <Select value={source} options={SOURCE_OPTIONS} onChange={setSource} disabled={running} />
        </Form.Item>

        {source === 'custom' && (
          <Form.Item label="URL 模板（须包含 {z} {x} {y}）" style={{ marginBottom: 8 }}>
            <Input
              placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
              value={customTemplate}
              onChange={(e) => setCustomTemplate(e.target.value)}
              disabled={running}
            />
          </Form.Item>
        )}

        <Form.Item label="输出格式" style={{ marginBottom: 8 }}>
          <Radio.Group
            value={output}
            onChange={(e) => { setOutput(e.target.value); setPath('') }}
            disabled={running}
          >
            <Radio.Button value="mbtiles">MBTiles 文件</Radio.Button>
            <Radio.Button value="directory">z/x/y 目录</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item label="保存位置" style={{ marginBottom: 8 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input value={path} readOnly placeholder="点击右侧按钮选择" />
            <Button icon={<FolderOpenOutlined />} onClick={handlePickPath} disabled={running}>
              选择
            </Button>
          </Space.Compact>
        </Form.Item>

        <div style={{ marginBottom: 12 }}>
          <Text type={estimate > MAX_TILES ? 'danger' : estimate > WARN_TILES ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
            预计 {estimate.toLocaleString()} 张瓦片
            {estimate > MAX_TILES && ` — 超过上限 ${MAX_TILES.toLocaleString()}，请缩小范围或降低级别`}
            {estimate > WARN_TILES && estimate <= MAX_TILES && ' — 数量较大，下载可能较慢且占用服务器资源'}
          </Text>
        </div>

        {task && (
          <div style={{ marginBottom: 12 }}>
            <Progress
              percent={progressPercent}
              status={task.status === 'error' ? 'exception' : task.status === 'completed' ? 'success' : 'active'}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              成功 {task.done} / 跳过 {task.skipped} / 失败 {task.failed} / 共 {task.total}
            </Text>
          </div>
        )}

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {running ? (
            <Button danger onClick={handleCancel}>取消下载</Button>
          ) : (
            <Button type="primary" icon={<DownloadOutlined />} loading={starting} disabled={!canStart} onClick={handleStart}>
              开始下载
            </Button>
          )}
        </Space>
      </Form>
    </Modal>
  )
}
