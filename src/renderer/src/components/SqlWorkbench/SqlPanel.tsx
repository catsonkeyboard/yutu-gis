import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd'
import type { TableProps } from 'antd'
import {
  CaretRightOutlined,
  CloseOutlined,
  DownOutlined,
  FileAddOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { useSqlPanelStore } from '../../stores/sqlPanelStore'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import {
  parseApiError,
  sqlListTables,
  sqlQuery,
  sqlQueryGeojson,
  sqlRegisterFile,
  sqlRegisterTable,
  sqlStatus,
  type SqlQueryResult,
  type SqlTableInfo,
} from '../../services/api'
import { getGeoJSONBounds } from '../../utils/geo'

const { Text } = Typography

function sampleQueries(tables: SqlTableInfo[], t: (k: string) => string) {
  const first = tables[0]?.table ?? 'my_layer'
  const second = tables[1]?.table ?? first
  return [
    {
      key: 'stats',
      label: t('sql.sampleStats'),
      sql: `SELECT count(*) AS n\nFROM "${first}"`,
    },
    {
      key: 'area',
      label: t('sql.sampleArea'),
      sql: `SELECT *, ST_Area(geom) AS area\nFROM "${first}"\nORDER BY area DESC\nLIMIT 20`,
    },
    {
      key: 'join',
      label: t('sql.sampleJoin'),
      sql: `SELECT a.*\nFROM "${first}" a\nJOIN "${second}" b\n  ON ST_Intersects(a.geom, b.geom)`,
    },
  ]
}

export default function SqlPanel(): ReactElement {
  const { t } = useTranslation()
  const { height, sql, setOpen, setHeight, setSql } = useSqlPanelStore()
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)

  const [tables, setTables] = useState<SqlTableInfo[]>([])
  const [spatial, setSpatial] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [addingLayer, setAddingLayer] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  const syncLayers = async () => {
    setSyncing(true)
    try {
      const vectorLayers = useLayerStore.getState().layers.filter((l) => l.type === 'geojson')
      for (const layer of vectorLayers) {
        await sqlRegisterTable(layer.name, layer.source as GeoJSON.FeatureCollection, layer.id)
      }
      setTables(await sqlListTables())
      if (vectorLayers.length) message.success(t('sql.synced', { count: vectorLayers.length }))
    } catch (e) {
      message.error(`${t('sql.syncFailed')}：${parseApiError(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  // First open: probe spatial support and auto-sync current layers
  useEffect(() => {
    sqlStatus()
      .then((s) => setSpatial(s.spatial))
      .catch(() => setSpatial(null))
    syncLayers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenFile = async () => {
    const filePath = await window.electronAPI.openFileDialog([
      {
        name: '数据文件 (GPKG/SHP/GeoJSON/CSV/Parquet…)',
        extensions: ['gpkg', 'shp', 'geojson', 'json', 'kml', 'kmz', 'gpx', 'fgb', 'csv', 'parquet'],
      },
      { name: 'All Files', extensions: ['*'] },
    ])
    if (!filePath) return
    try {
      const info = await sqlRegisterFile(filePath)
      setTables(await sqlListTables())
      message.success(t('sql.fileRegistered', { table: info.table }))
      if (!sql.trim()) setSql(`SELECT * FROM "${info.table}" LIMIT 100`)
    } catch (e) {
      message.error(parseApiError(e))
    }
  }

  const insertText = (text: string) => {
    const el = textareaRef.current
    if (!el) {
      setSql(sql + text)
      return
    }
    const start = el.selectionStart ?? sql.length
    const end = el.selectionEnd ?? sql.length
    setSql(sql.slice(0, start) + text + sql.slice(end))
  }

  const execute = async () => {
    if (!sql.trim()) return
    setRunning(true)
    const started = performance.now()
    try {
      const res = await sqlQuery(sql)
      setResult(res)
      setElapsed(performance.now() - started)
    } catch (e) {
      setResult(null)
      setElapsed(null)
      message.error(parseApiError(e))
    } finally {
      setRunning(false)
    }
  }

  const handleAddAsLayer = async () => {
    setAddingLayer(true)
    try {
      const geojson = await sqlQueryGeojson(sql)
      if (!geojson.features.length) {
        message.info(t('sql.emptyGeojson'))
        return
      }
      const id = nanoid()
      const name = `SQL_${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
      addLayer({ id, name, type: 'geojson', source: geojson, visible: true, opacity: 1 })
      setSelectedLayer(id)
      const bounds = getGeoJSONBounds(geojson)
      if (bounds) requestFitBounds(bounds)
      message.success(t('sql.layerAdded', { name, count: geojson.features.length }))
    } catch (e) {
      message.error(parseApiError(e))
    } finally {
      setAddingLayer(false)
    }
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    resizeStartY.current = e.clientY
    resizeStartHeight.current = height
    const onMove = (ev: MouseEvent) => {
      setHeight(resizeStartHeight.current - (ev.clientY - resizeStartY.current))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const treeData = useMemo(
    () =>
      tables.map((tb) => ({
        title: (
          <span style={{ fontSize: 12 }} title={tb.path ?? undefined}>
            {tb.table}{' '}
            {tb.kind === 'file' ? (
              <Tag color="geekblue" style={{ fontSize: 9, lineHeight: '14px', marginInlineEnd: 0 }}>
                {t('sql.fileTag')}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 10 }}>({tb.rows})</Text>
            )}
          </span>
        ),
        key: `t:${tb.table}`,
        children: tb.columns.map((c) => ({
          title: (
            <span style={{ fontSize: 11 }}>
              {c.name} <Text type="secondary" style={{ fontSize: 10 }}>{c.type.split('(')[0]}</Text>
            </span>
          ),
          key: `c:${tb.table}:${c.name}`,
        })),
      })),
    [tables]
  )

  const resultHasGeometry = result?.columns.some((c) => c.geometry) ?? false

  const resultColumns: TableProps<Record<string, unknown>>['columns'] = useMemo(() => {
    if (!result) return []
    return result.columns.map((c, i) => ({
      title: c.name,
      dataIndex: String(i),
      width: 150,
      ellipsis: true,
      render: (v: unknown) => (
        <span style={{ fontSize: 12 }}>
          {v === null || v === undefined ? '' : String(v).slice(0, 200)}
        </span>
      ),
    }))
  }, [result])

  const resultRows = useMemo(() => {
    if (!result) return []
    return result.rows.map((row, ri) => {
      const obj: Record<string, unknown> = { __key: ri }
      row.forEach((v, ci) => {
        obj[String(ci)] = v
      })
      return obj
    })
  }, [result])

  return (
    <div
      style={{
        height,
        flexShrink: 0,
        borderTop: '1px solid #d9dce0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div
        onMouseDown={handleResizeStart}
        style={{ position: 'absolute', top: -2, left: 0, right: 0, height: 5, cursor: 'row-resize', zIndex: 20 }}
      />
      {/* Header */}
      <div
        style={{
          padding: '4px 8px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <Text strong style={{ fontSize: 13 }}>
          {t('sql.title')}
        </Text>
        {spatial !== null && (
          <Tag color={spatial ? 'green' : 'orange'} style={{ fontSize: 10 }}>
            {spatial ? t('sql.spatialOn') : t('sql.spatialOff')}
          </Tag>
        )}
        <Space size={4} style={{ marginLeft: 'auto' }}>
          <Tooltip title={t('sql.openFileHint')}>
            <Button size="small" icon={<FileAddOutlined />} onClick={handleOpenFile}>
              {t('sql.openFile')}
            </Button>
          </Tooltip>
          <Tooltip title={t('sql.sync')}>
            <Button size="small" icon={<SyncOutlined />} loading={syncing} onClick={syncLayers}>
              {t('sql.sync')}
            </Button>
          </Tooltip>
          <Dropdown
            menu={{
              items: sampleQueries(tables, t).map((s) => ({ key: s.key, label: s.label })),
              onClick: ({ key }) => {
                const s = sampleQueries(tables, t).find((q) => q.key === key)
                if (s) setSql(s.sql)
              },
            }}
            trigger={['click']}
          >
            <Button size="small">
              {t('sql.samples')} <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            type="primary"
            icon={<CaretRightOutlined />}
            loading={running}
            onClick={execute}
          >
            {t('sql.run')}
          </Button>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
        </Space>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Tables sidebar */}
        <div
          style={{
            width: 190,
            flexShrink: 0,
            borderRight: '1px solid #e5e7eb',
            overflow: 'auto',
            padding: '4px 4px',
          }}
        >
          {tables.length === 0 ? (
            <Empty description={t('sql.noTables')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 16 }} />
          ) : (
            <Tree
              treeData={treeData}
              selectable
              onSelect={(keys) => {
                const key = String(keys[0] ?? '')
                if (key.startsWith('t:')) insertText(`"${key.slice(2)}"`)
                else if (key.startsWith('c:')) insertText(`"${key.split(':')[2]}"`)
              }}
              blockNode
            />
          )}
        </div>

        {/* Editor + results */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Input.TextArea
            ref={(node) => {
              textareaRef.current = node?.resizableTextArea?.textArea ?? null
            }}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                execute()
              }
            }}
            placeholder={t('sql.placeholder')}
            style={{
              fontFamily: 'Menlo, Consolas, monospace',
              fontSize: 12,
              height: 96,
              resize: 'none',
              borderRadius: 0,
              border: 'none',
              borderBottom: '1px solid #e5e7eb',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              padding: '2px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid #f0f0f0',
              flexShrink: 0,
            }}
          >
            {result && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t('sql.rowCount', { count: result.row_count })}
                {result.truncated && ` · ${t('sql.truncated')}`}
                {elapsed !== null && ` · ${elapsed.toFixed(0)} ms`}
              </Text>
            )}
            {resultHasGeometry && (
              <Button
                size="small"
                icon={<PlusOutlined />}
                loading={addingLayer}
                onClick={handleAddAsLayer}
                style={{ marginLeft: 'auto' }}
              >
                {t('sql.addAsLayer')}
              </Button>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {!result ? (
              <Empty
                description={t('sql.noResult')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ marginTop: 16 }}
              />
            ) : (
              <Table
                size="small"
                virtual
                columns={resultColumns}
                dataSource={resultRows}
                rowKey="__key"
                pagination={false}
                scroll={{ y: height - 200, x: result.columns.length * 150 }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
