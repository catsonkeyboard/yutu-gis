import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Classes,
  HTMLSelect,
  InputGroup,
  NonIdealState,
  SegmentedControl,
  Tooltip,
} from '@blueprintjs/core'
import { Cell, Column, SelectionModes, Table2, type Region } from '@blueprintjs/table'
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
  type FilterOp,
} from './tableUtils'
import ChartsTab from './ChartsTab'
import FieldCalculatorModal from './FieldCalculatorModal'
import { message } from '../../utils/toaster'

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
  const [calcOpen, setCalcOpen] = useState(false)
  const [filterField, setFilterField] = useState<string | undefined>(undefined)
  const [filterOp, setFilterOp] = useState<FilterOp>('eq')
  const [filterValue, setFilterValue] = useState('')

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

  const needsValueInput = filterOp !== 'empty' && filterOp !== 'notEmpty'

  const handleSelection = (regions: Region[]) => {
    const region = regions[0]
    if (!region || !region.rows) return
    const rowIndex = region.rows[0]
    const row = rows[rowIndex]
    if (!row) return
    setSelectedFeatureProps(row.props)
    const bounds = getFeatureBounds(row.feature)
    if (bounds) requestFitBounds(bounds)
  }

  return (
    <div
      style={{
        height,
        flexShrink: 0,
        borderTop: '1px solid var(--color-border, #d9dce0)',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          top: -2,
          left: 0,
          right: 0,
          height: 5,
          cursor: 'row-resize',
          zIndex: 20,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '4px 8px',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          backgroundColor: 'var(--color-bg-panel, #f5f6f8)',
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
          {t('attrTable.title')}
        </span>

        {isVector && (
          <div style={{ flexShrink: 0 }}>
            <SegmentedControl
              small
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as 'table' | 'charts')}
              options={[
                { value: 'table', label: t('attrTable.tabTable') },
                { value: 'charts', label: t('attrTable.tabCharts') },
              ]}
            />
          </div>
        )}

        {selectedLayer && (
          <span className={Classes.TEXT_MUTED} style={{ fontSize: 11, flexShrink: 0 }}>
            {selectedLayer.name} ·{' '}
            {filter
              ? t('attrTable.countFiltered', { shown: filtered.length, total: allFeatures.length })
              : t('attrTable.count', { total: allFeatures.length })}
            {truncated && ` · ${t('attrTable.tooManyColumns')}`}
          </span>
        )}

        {isVector && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <HTMLSelect
              value={filterField ?? ''}
              onChange={(e) => setFilterField(e.target.value || undefined)}
              options={[
                { value: '', label: t('attrTable.field') },
                ...colInfos.map((c) => ({ value: c.key, label: c.key })),
              ]}
              style={{ width: 120 }}
            />
            <HTMLSelect
              value={filterOp}
              onChange={(e) => setFilterOp(e.target.value as FilterOp)}
              options={FILTER_OPS}
              style={{ width: 72 }}
            />
            {needsValueInput && (
              <InputGroup
                small
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCurrentFilter()
                }}
                placeholder={t('attrTable.value')}
                style={{ width: 110 }}
              />
            )}
            <Button
              size="small"
              icon="filter"
              onClick={applyCurrentFilter}
              disabled={!filterField}
              text={t('attrTable.applyFilter')}
            />
            {filter && (
              <Button
                size="small"
                onClick={clearFilter}
                text={t('attrTable.clearFilter')}
              />
            )}
            <Tooltip content={t('attrTable.saveFiltered')} placement="top">
              <Button
                size="small"
                variant="minimal"
                icon="floppy-disk"
                disabled={!filter || filtered.length === 0}
                onClick={handleSaveFiltered}
              />
            </Tooltip>
            <Tooltip content={t('fieldCalc.title')} placement="top">
              <Button
                size="small"
                variant="minimal"
                icon="calculator"
                onClick={() => setCalcOpen(true)}
              />
            </Tooltip>
          </div>
        )}

        <Button
          size="small"
          variant="minimal"
          icon="cross"
          onClick={() => setOpen(false)}
          style={{ flexShrink: 0, marginLeft: isVector ? 0 : 'auto' }}
        />
      </div>

      {/* Body */}
      {!isVector ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <NonIdealState
            icon="th"
            title={t('attrTable.selectVectorLayer')}
            description="请在图层面板中选中一个矢量图层"
          />
        </div>
      ) : activeTab === 'charts' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ChartsTab features={filtered} columns={colInfos} height={height} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <Table2
            numRows={rows.length}
            enableRowHeader={true}
            enableColumnResizing={true}
            enableRowResizing={false}
            selectionModes={SelectionModes.ROWS_AND_CELLS}
            onSelection={handleSelection}
            defaultRowHeight={26}
          >
            {[
              <Column
                key="__num__"
                name="#"
                cellRenderer={(rowIndex) => (
                  <Cell style={{ fontSize: 11, textAlign: 'center' }}>{rowIndex + 1}</Cell>
                )}
              />,
              ...colInfos.map((c) => (
                <Column
                  key={c.key}
                  name={c.key}
                  cellRenderer={(rowIndex) => {
                    const val = rows[rowIndex]?.props[c.key]
                    const isRowSelected = rowIndex === selectedRowKey
                    return (
                      <Cell
                        style={{
                          fontSize: 12,
                          backgroundColor: isRowSelected ? '#e4edf6' : undefined,
                          color: c.internal ? '#aaa' : undefined,
                          textAlign: c.numeric ? 'right' : 'left',
                        }}
                      >
                        <div
                          onDoubleClick={() => {
                            const r = rows[rowIndex]
                            if (!r) return
                            setSelectedFeatureProps(r.props)
                            const b = getFeatureBounds(r.feature)
                            if (b) requestFitBounds(b)
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {displayValue(val)}
                        </div>
                      </Cell>
                    )
                  }}
                />
              )),
            ]}
          </Table2>
        </div>
      )}

      <FieldCalculatorModal
        open={calcOpen}
        layerId={selectedLayerId}
        onClose={() => setCalcOpen(false)}
      />
    </div>
  )
}
