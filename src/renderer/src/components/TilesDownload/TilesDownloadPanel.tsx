import { useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import {
  Button,
  Classes,
  ControlGroup,
  HTMLSelect,
  Icon,
  InputGroup,
  Intent,
  ProgressBar,
  Radio,
  RadioGroup,
  RangeSlider,
} from '@blueprintjs/core'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTilesPanelStore } from '../../stores/tilesPanelStore'
import { useMapBboxSelect, viewportBbox } from '../../hooks/useMapBboxSelect'
import BboxSelector from '../common/BboxSelector'
import { getTileUrlTemplate, type MapProvider } from '../MapCanvas/tileProviders'
import { countTiles } from '../../utils/tileMath'
import {
  startTileDownload,
  getTileTask,
  cancelTileTask,
  type TileTaskState,
} from '../../services/api'
import { message } from '../../utils/toaster'

const WARN_TILES = 10_000
const MAX_TILES = 200_000 // 与后端 routers/tiles.py MAX_TILES 保持一致

const SOURCE_OPTIONS: { value: MapProvider | 'custom'; label: string }[] = [
  { value: 'osm', label: 'OSM 街道图' },
  { value: 'google-street', label: 'Google 街道图' },
  { value: 'google-satellite', label: 'Google 卫星图' },
  { value: 'amap-street', label: '高德街道图' },
  { value: 'amap-satellite', label: '高德影像图' },
  { value: 'amap-terrain', label: '高德地形图' },
  { value: 'custom', label: '自定义 URL 模板' },
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
  const open = useTilesPanelStore((s) => s.open)
  const setOpen = useTilesPanelStore((s) => s.setOpen)
  const bbox = useTilesPanelStore((s) => s.bbox)
  const setBbox = useTilesPanelStore((s) => s.setBbox)
  const selecting = useTilesPanelStore((s) => s.selecting)
  const setSelecting = useTilesPanelStore((s) => s.setSelecting)

  const downloadDir = useSettingsStore((s) => s.downloadDir)
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const defaultProvider = useMapStore((s) => s.provider)

  useMapBboxSelect({
    map,
    active: open,
    bbox,
    selecting,
    setBbox,
    setSelecting,
    sourceId: 'tiles-bbox',
    color: '#1a6fb5',
    provider: defaultProvider,
  })

  const [zoomRange, setZoomRange] = useState<[number, number]>([12, 14])
  const [source, setSource] = useState<MapProvider | 'custom'>(defaultProvider)
  const [customTemplate, setCustomTemplate] = useState('')
  const [output, setOutput] = useState<'mbtiles' | 'directory'>('mbtiles')
  const [path, setPath] = useState('')
  const [task, setTask] = useState<TileTaskState | null>(null)
  const [starting, setStarting] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const defaultPathFor = (fmt: 'mbtiles' | 'directory') => {
    const base = downloadDir || '/tmp'
    const name = timestampName()
    return fmt === 'mbtiles' ? `${base}/${name}.mbtiles` : `${base}/${name}`
  }

  useEffect(() => {
    if (open && !path) {
      setPath(defaultPathFor('mbtiles'))
    }
  }, [open, downloadDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  const running = task?.status === 'running' || starting

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSource(e.target.value as MapProvider | 'custom')
  }

  const handlePickPath = async () => {
    if (output === 'mbtiles') {
      const p = await window.electronAPI.saveFileDialog(
        [{ name: 'MBTiles', extensions: ['mbtiles'] }],
        path.split('/').pop() || 'tiles.mbtiles'
      )
      if (p) setPath(p)
    } else {
      const p = await window.electronAPI.openDirectoryDialog()
      if (p) setPath(`${p}/${timestampName()}`)
    }
  }

  const estimate = useMemo(() => {
    if (!bbox) return 0
    return countTiles(bbox[0], bbox[1], bbox[2], bbox[3], zoomRange[0], zoomRange[1])
  }, [bbox, zoomRange])

  const canStart =
    Boolean(bbox) &&
    Boolean(path) &&
    (source !== 'custom' || customTemplate.includes('{z}')) &&
    estimate > 0 &&
    estimate <= MAX_TILES &&
    !running

  const handleStart = async () => {
    if (!bbox || !path) return
    const url_template =
      source === 'custom'
        ? customTemplate
        : getTileUrlTemplate(source, {
            google: apiKeys.google,
            amap: apiKeys.amap,
          })

    setStarting(true)
    try {
      const { task_id } = await startTileDownload({
        south: bbox[0],
        west: bbox[1],
        north: bbox[2],
        east: bbox[3],
        min_zoom: zoomRange[0],
        max_zoom: zoomRange[1],
        url_template,
        output,
        path,
        name: path.split('/').pop()?.replace(/\.mbtiles$/, '') || 'tiles',
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
              message.info('下载已取消，已下载的瓦片已保留')
            } else {
              message.error(`下载出错：${state.message}`)
            }
          }
        } catch {
          // ignore error during poll
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
        // ignore
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

  const progressPercent =
    task && task.total > 0
      ? Math.round(((task.done + task.failed + task.skipped) / task.total) * 100)
      : 0

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#646a73',
    margin: '6px 0 3px',
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 320,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 600,
        padding: '10px 14px 14px',
        border: '1px solid var(--color-border, #d9dce0)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon icon="cloud-download" size={14} />
          <span>下载地图瓦片</span>
        </div>
        <Button size="small" variant="minimal" icon="cross" onClick={handleClose} />
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

      <div style={labelStyle}>
        缩放级别 z{zoomRange[0]} ~ z{zoomRange[1]}
      </div>
      <div style={{ padding: '0 6px 12px' }}>
        <RangeSlider
          min={0}
          max={19}
          stepSize={1}
          labelStepSize={3}
          value={zoomRange}
          onChange={(v) => setZoomRange(v as [number, number])}
          disabled={running}
        />
      </div>

      <div style={labelStyle}>瓦片源</div>
      <HTMLSelect
        fill
        value={source}
        options={SOURCE_OPTIONS}
        onChange={handleSourceChange}
        disabled={running}
        style={{ marginBottom: 8 }}
      />

      {source === 'custom' && (
        <>
          <div style={labelStyle}>URL 模板（须包含 {'{z} {x} {y}'}）</div>
          <InputGroup
            small
            placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
            value={customTemplate}
            onChange={(e) => setCustomTemplate(e.target.value)}
            disabled={running}
            style={{ marginBottom: 8 }}
          />
        </>
      )}

      <div style={labelStyle}>输出格式</div>
      <RadioGroup
        inline
        selectedValue={output}
        onChange={(e) => {
          const val = (e.target as HTMLInputElement).value as 'mbtiles' | 'directory'
          setOutput(val)
          setPath(defaultPathFor(val))
        }}
        disabled={running}
        style={{ marginBottom: 8 }}
      >
        <Radio label="MBTiles 文件" value="mbtiles" style={{ marginRight: 16 }} />
        <Radio label="z/x/y 目录" value="directory" />
      </RadioGroup>

      <div style={labelStyle}>保存位置</div>
      <ControlGroup fill style={{ marginBottom: 8 }}>
        <InputGroup
          small
          value={path}
          readOnly
          placeholder="点击右侧按钮选择路径"
        />
        <Button
          small
          icon="folder-open"
          onClick={handlePickPath}
          disabled={running}
        />
      </ControlGroup>

      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 12,
            color:
              estimate > MAX_TILES
                ? '#c5382c'
                : estimate > WARN_TILES
                  ? '#d4880f'
                  : '#646a73',
          }}
        >
          预计 {estimate.toLocaleString()} 张瓦片
          {estimate > MAX_TILES && ` — 超过上限 ${MAX_TILES.toLocaleString()}`}
          {estimate > WARN_TILES && estimate <= MAX_TILES && ' — 数量较大，下载可能较慢'}
        </div>
      </div>

      {task && (
        <div style={{ marginBottom: 10 }}>
          <ProgressBar
            value={progressPercent / 100}
            intent={
              task.status === 'error'
                ? Intent.DANGER
                : task.status === 'completed'
                  ? Intent.SUCCESS
                  : Intent.PRIMARY
            }
          />
          <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, marginTop: 4 }}>
            成功 {task.done} / 跳过 {task.skipped} / 失败 {task.failed} / 共 {task.total} ({progressPercent}%)
          </div>
        </div>
      )}

      {running ? (
        <Button
          intent={Intent.DANGER}
          size="small"
          onClick={handleCancelTask}
          style={{ width: '100%' }}
          text="取消下载"
        />
      ) : (
        <Button
          intent={Intent.PRIMARY}
          size="small"
          icon="download"
          loading={starting}
          disabled={!canStart}
          onClick={handleStart}
          style={{ width: '100%' }}
          text="开始下载"
        />
      )}
    </div>
  )
}
