import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, Empty, Input, Popover, Radio, Select, Space, Table, Tooltip, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { CloseOutlined, FilterOutlined, InfoCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { useAttributeTableStore } from '../../stores/attributeTableStore'
import { getFeatureBounds, matchesSelectedProps } from '../../utils/geo'
import {
  applyFilter,
  deriveColumns,
  displayValue,
  fieldStats,
  type ColumnInfo,
  type FilterOp,
} from './tableUtils'
import ChartsTab from './ChartsTab'

const { Text } = Typography

const FILTER_OPS: { value: FilterOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: '包含' },
  { value: 'empty', label: '为空' },
  { value: 'notEmpty', label: '不为空' },
]

interface Row {
  key: number
  props: Record<string, unknown>
  feature: GeoJSON.Feature
}

function ColumnStats({ features, col }: { features: GeoJSON.Feature[]; col: ColumnInfo }): ReactElement {
  const stats = useMemo(() => fieldStats(features, col.key, col.numeric), [features, col])
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4))
  return (
    <div style={{ fontSize: 12, lineHeight: 1.9 }}>
      <div>非空值：{stats.count}</div>
      {'sum' in stats ? (
        <>
          <div>最小值：{fmt(stats.min)}</div>
          <div>最大值：{fmt(stats.max)}</div>
          <div>平均值：{fmt(stats.mean)}</div>
          <div>总和：{fmt(stats.sum)}</div>
        </>
      ) : (
        <div>唯一值：{stats.unique}</div>
      )}
    </div>
  )
}

export default function AttributeTablePanel(): ReactElement {
  const { t } = useTranslation()
  const layers = useLayerStore((s) => s.layers)
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId)
  const selectedFeatureProps = useLayerStore((s) => s.selectedFeatureProps)
  const setSelectedFeatureProps = useLayerStore((s) => s.setSelectedFeatureProps)
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const { height, filter, setOpen, setHeight, setFilter } = useAttributeTableStore()

  const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table')
  const [filterField, setFilterField] = useState<string | undefined>(undefined)
  const [filterOp, setFilterOp] = useState<FilterOp>('eq')
  const [filterValue, setFilterValue] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableRef = useRef<any>(null)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  )
  const isVector = selectedLayer?.type === 'geojson'
  const allFeatures = useMemo<GeoJSON.Feature[]>(
    () => (isVector ? (selectedLayer!.source as GeoJSON.FeatureCollection).features : []),
    [selectedLayer, isVector]
  )

  const { columns: colInfos, truncated } = useMemo(() => deriveColumns(allFeatures), [allFeatures])
  const numericFields = useMemo(
    () => new Set(colInfos.filter((c) => c.numeric).map((c) => c.key)),
    [colInfos]
  )

  // Reset filter when switching layers
  useEffect(() => {
    setFilter(null)
    setFilterField(undefined)
    setFilterOp('eq')
    setFilterValue('')
  }, [selectedLayerId, setFilter])

  const filtered = useMemo(
    () => applyFilter(allFeatures, filter, numericFields),
    [allFeatures, filter, numericFields]
  )

  const rows = useMemo<Row[]>(
    () =>
      filtered.map((f, i) => ({
        key: i,
        props: (f.properties ?? {}) as Record<string, unknown>,
        feature: f,
      })),
    [filtered]
  )

  const selectedRowKey = useMemo(() => {
    if (!selectedFeatureProps) return undefined
    const idx = rows.findIndex((r) => matchesSelectedProps(r.props, selectedFeatureProps))
    return idx >= 0 ? idx : undefined
  }, [rows, selectedFeatureProps])

  // Scroll to row selected from map click
  useEffect(() => {
    if (selectedRowKey === undefined) return
    tableRef.current?.scrollTo?.({ index: selectedRowKey })
  }, [selectedRowKey])

  const applyCurrentFilter = () => {
    if (!filterField) {
      setFilter(null)
      return
    }
    setFilter({ field: filterField, op: filterOp, value: filterValue })
  }

  const clearFilter = () => {
    setFilter(null)
    setFilterField(undefined)
    setFilterValue('')
  }

  const handleSaveFiltered = () => {
    if (!selectedLayer || !filter || filtered.length === 0) return
    const id = nanoid()
    const name = `${t('attrTable.filteredPrefix')}_${selectedLayer.name}`
    addLayer({
      id,
      name,
      type: 'geojson',
      source: { type: 'FeatureCollection', features: filtered },
      visible: true,
      opacity: 1,
    })
    setSelectedLayer(id)
    message.success(t('attrTable.savedFiltered', { name, count: filtered.length }))
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

  const tableColumns: TableProps<Row>['columns'] = useMemo(() => {
    const cols: NonNullable<TableProps<Row>['columns']> = [
      {
        title: '#',
        dataIndex: 'key',
        width: 56,
        fixed: 'left',
        render: (v: number) => <Text type="secondary" style={{ fontSize: 11 }}>{v + 1}</Text>,
      },
    ]
    for (const c of colInfos) {
      cols.push({
        title: (
          <Space size={4}>
            <span style={{ color: c.internal ? '#aaa' : undefined }}>{c.key}</span>
            <Popover
              content={<ColumnStats features={filtered} col={c} />}
              title={t('attrTable.stats')}
              trigger="click"
            >
              <InfoCircleOutlined
                style={{ color: '#b0b6be', fontSize: 11, cursor: 'pointer' }}
                onClick={(e) => e.stopPropagation()}
              />
            </Popover>
          </Space>
        ),
        dataIndex: ['props', c.key],
        width: 140,
        ellipsis: true,
        align: c.numeric ? 'right' : 'left',
        sorter: c.numeric
          ? (a: Row, b: Row) => (Number(a.props[c.key]) || 0) - (Number(b.props[c.key]) || 0)
          : (a: Row, b: Row) => displayValue(a.props[c.key]).localeCompare(displayValue(b.props[c.key])),
        render: (v: unknown) => (
          <span style={{ fontSize: 12, color: c.internal ? '#aaa' : undefined }}>{displayValue(v)}</span>
        ),
      })
    }
    return cols
  }, [colInfos, filtered, t])

  const needsValueInput = filterOp !== 'empty' && filterOp !== 'notEmpty'

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
        <Text strong style={{ fontSize: 13, flexShrink: 0 }}>
          {t('attrTable.title')}
        </Text>
        {isVector && (
          <Radio.Group
            size="small"
            optionType="button"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            options={[
              { value: 'table', label: t('attrTable.tabTable') },
              { value: 'charts', label: t('attrTable.tabCharts') },
            ]}
            style={{ flexShrink: 0 }}
          />
        )}
        {selectedLayer && (
          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
            {selectedLayer.name} ·{' '}
            {filter
              ? t('attrTable.countFiltered', { shown: filtered.length, total: allFeatures.length })
              : t('attrTable.count', { total: allFeatures.length })}
            {truncated && ` · ${t('attrTable.tooManyColumns')}`}
          </Text>
        )}
        {isVector && (
          <Space size={4} style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <Select
              size="small"
              placeholder={t('attrTable.field')}
              style={{ width: 130 }}
              value={filterField}
              onChange={setFilterField}
              options={colInfos.map((c) => ({ value: c.key, label: c.key }))}
              showSearch
              allowClear
            />
            <Select
              size="small"
              style={{ width: 84 }}
              value={filterOp}
              onChange={setFilterOp}
              options={FILTER_OPS}
            />
            {needsValueInput && (
              <Input
                size="small"
                style={{ width: 120 }}
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                onPressEnter={applyCurrentFilter}
                placeholder={t('attrTable.value')}
              />
            )}
            <Button size="small" icon={<FilterOutlined />} onClick={applyCurrentFilter} disabled={!filterField}>
              {t('attrTable.applyFilter')}
            </Button>
            {filter && (
              <Button size="small" onClick={clearFilter}>
                {t('attrTable.clearFilter')}
              </Button>
            )}
            <Tooltip title={t('attrTable.saveFiltered')}>
              <Button
                size="small"
                icon={<SaveOutlined />}
                disabled={!filter || filtered.length === 0}
                onClick={handleSaveFiltered}
              />
            </Tooltip>
          </Space>
        )}
        <Button
          size="small"
          type="text"
          icon={<CloseOutlined />}
          onClick={() => setOpen(false)}
          style={{ flexShrink: 0, marginLeft: isVector ? 0 : 'auto' }}
        />
      </div>

      {/* Body */}
      {!isVector ? (
        <Empty
          description={t('attrTable.selectVectorLayer')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 24 }}
        />
      ) : activeTab === 'charts' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ChartsTab features={filtered} columns={colInfos} height={height} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Table<Row>
            ref={tableRef}
            size="small"
            virtual
            columns={tableColumns}
            dataSource={rows}
            pagination={false}
            scroll={{ y: height - 76, x: 56 + colInfos.length * 140 }}
            rowKey="key"
            onRow={(row) => ({
              style: {
                cursor: 'pointer',
                background: row.key === selectedRowKey ? '#e4edf6' : undefined,
              },
              onClick: () => {
                setSelectedFeatureProps(row.props)
                const bounds = getFeatureBounds(row.feature)
                if (bounds) requestFitBounds(bounds)
              },
            })}
          />
        </div>
      )}
    </div>
  )
}
