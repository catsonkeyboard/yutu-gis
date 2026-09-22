import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Classes,
  Intent,
  Menu,
  MenuItem,
  NonIdealState,
  Popover,
  Tag,
  Tooltip,
  Tree,
  type TreeNodeInfo,
} from '@blueprintjs/core'
import { Cell, Column, SelectionModes, Table2 } from '@blueprintjs/table'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { useSqlPanelStore } from '../../stores/sqlPanelStore'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import {
  parseApiError,
  sqlExportCsv,
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
import { message } from '../../utils/toaster'

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
  const { height, sql, history, setOpen, setHeight, setSql, pushHistory } = useSqlPanelStore()
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

  // Track expanded tree nodes
  const [expandedNodes, setExpandedNodes] = useState<Set<string | number>>(new Set())

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
      const tbls = await sqlListTables()
      setTables(tbls)
      setExpandedNodes(new Set(tbls.map((tb) => `t:${tb.table}`)))
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
      const tbls = await sqlListTables()
      setTables(tbls)
      setExpandedNodes((prev) => new Set(prev).add(`t:${info.table}`))
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
      pushHistory(sql)
    } catch (e) {
      setResult(null)
      setElapsed(null)
      message.error(parseApiError(e))
    } finally {
      setRunning(false)
    }
  }

  const handleExportCsv = async () => {
    const filePath = await window.electronAPI.saveFileDialog(
      [{ name: 'CSV', extensions: ['csv'] }],
      'query-result.csv'
    )
    if (!filePath) return
    try {
      const info = await sqlExportCsv(sql, filePath)
      message.success(t('sql.csvExported', { rows: info.rows }))
    } catch (e) {
      message.error(parseApiError(e))
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

  const treeNodes: TreeNodeInfo[] = useMemo(
    () =>
      tables.map((tb) => {
        const tableKey = `t:${tb.table}`
        const isExp = expandedNodes.has(tableKey)
        return {
          id: tableKey,
          icon: 'th',
          isExpanded: isExp,
          label: (
            <span style={{ fontSize: 12 }} title={tb.path ?? undefined}>
              {tb.table}
            </span>
          ),
          secondaryLabel:
            tb.kind === 'file' ? (
              <Tag minimal intent={Intent.PRIMARY} style={{ fontSize: 9, minHeight: 16, padding: '0 4px' }}>
                {t('sql.fileTag')}
              </Tag>
            ) : (
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary, #8f959e)' }}>
                ({tb.rows})
              </span>
            ),
          childNodes: tb.columns.map((c) => ({
            id: `c:${tb.table}:${c.name}`,
            icon: c.geometry ? 'polygon-filter' : 'column-layout',
            label: <span style={{ fontSize: 11 }}>{c.name}</span>,
            secondaryLabel: (
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary, #8f959e)' }}>
                {c.type.split('(')[0]}
              </span>
            ),
          })),
        }
      }),
    [tables, expandedNodes, t]
  )

  const handleNodeClick = (node: TreeNodeInfo) => {
    const key = String(node.id)
    if (key.startsWith('t:')) {
      insertText(`"${key.slice(2)}"`)
    } else if (key.startsWith('c:')) {
      insertText(`"${key.split(':')[2]}"`)
    }
  }

  const handleNodeExpand = (node: TreeNodeInfo) => {
    setExpandedNodes((prev) => new Set(prev).add(node.id))
  }

  const handleNodeCollapse = (node: TreeNodeInfo) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      next.delete(node.id)
      return next
    })
  }

  const resultHasGeometry = result?.columns.some((c) => c.geometry) ?? false

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
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t('sql.title')}</span>
        {spatial !== null && (
          <Tag
            intent={spatial ? Intent.SUCCESS : Intent.WARNING}
            minimal
            style={{ fontSize: 10 }}
          >
            {spatial ? t('sql.spatialOn') : t('sql.spatialOff')}
          </Tag>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tooltip content={t('sql.openFileHint')}>
            <Button
              small
              icon="document-open"
              text={t('sql.openFile')}
              onClick={handleOpenFile}
            />
          </Tooltip>
          <Tooltip content={t('sql.sync')}>
            <Button
              small
              icon="refresh"
              text={t('sql.sync')}
              loading={syncing}
              onClick={syncLayers}
            />
          </Tooltip>
          <Popover
            content={
              <Menu>
                {sampleQueries(tables, t).map((s) => (
                  <MenuItem
                    key={s.key}
                    text={s.label}
                    onClick={() => setSql(s.sql)}
                  />
                ))}
              </Menu>
            }
            placement="bottom-start"
          >
            <Button small rightIcon="caret-down" text={t('sql.samples')} />
          </Popover>
          <Popover
            disabled={!history.length}
            content={
              <Menu style={{ maxHeight: 240, overflowY: 'auto' }}>
                {history.map((h, i) => (
                  <MenuItem
                    key={i}
                    text={
                      <span style={{ fontSize: 11, fontFamily: 'Menlo, Consolas, monospace' }}>
                        {h.split('\n')[0].slice(0, 50)}
                      </span>
                    }
                    onClick={() => setSql(h)}
                  />
                ))}
              </Menu>
            }
            placement="bottom-start"
          >
            <Tooltip content={t('sql.history')}>
              <Button small icon="history" disabled={!history.length} />
            </Tooltip>
          </Popover>
          <Button
            small
            intent={Intent.PRIMARY}
            icon="play"
            text={t('sql.run')}
            loading={running}
            onClick={execute}
          />
          <Button small minimal icon="cross" onClick={() => setOpen(false)} />
        </div>
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
            <div style={{ padding: '24px 8px' }}>
              <NonIdealState
                icon="database"
                title={t('sql.noTables')}
                layout="vertical"
              />
            </div>
          ) : (
            <Tree
              contents={treeNodes}
              onNodeClick={handleNodeClick}
              onNodeExpand={handleNodeExpand}
              onNodeCollapse={handleNodeCollapse}
            />
          )}
        </div>

        {/* Editor + results */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <textarea
            ref={textareaRef}
            className={Classes.INPUT}
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
              boxShadow: 'none',
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
              <span style={{ fontSize: 11, color: '#646a73' }}>
                {t('sql.rowCount', { count: result.row_count })}
                {result.truncated && ` · ${t('sql.truncated')}`}
                {elapsed !== null && ` · ${elapsed.toFixed(0)} ms`}
              </span>
            )}
            {result && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button small icon="export" text={t('sql.exportCsv')} onClick={handleExportCsv} />
                {resultHasGeometry && (
                  <Button
                    small
                    icon="plus"
                    text={t('sql.addAsLayer')}
                    loading={addingLayer}
                    onClick={handleAddAsLayer}
                  />
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {!result ? (
              <div style={{ padding: '32px 0' }}>
                <NonIdealState
                  icon="th"
                  title={t('sql.noResult')}
                  layout="vertical"
                />
              </div>
            ) : (
              <Table2
                numRows={result.rows.length}
                enableRowHeader
                enableColumnResizing
                selectionModes={SelectionModes.ROWS_AND_CELLS}
              >
                {result.columns.map((col, colIdx) => (
                  <Column
                    key={colIdx}
                    name={col.name}
                    cellRenderer={(rowIdx) => {
                      const val = result.rows[rowIdx]?.[colIdx]
                      return (
                        <Cell style={{ fontSize: 11, fontFamily: 'monospace' }}>
                          {val === null || val === undefined ? '' : String(val).slice(0, 200)}
                        </Cell>
                      )
                    }}
                  />
                ))}
              </Table2>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
