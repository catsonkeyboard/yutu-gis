import { useMemo, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  ButtonGroup,
  Classes,
  Divider,
  HTMLTable,
  Intent,
  NonIdealState,
  Tag,
} from '@blueprintjs/core'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { getFeatureBounds, matchesSelectedProps } from '../../utils/geo'

const PAGE_SIZE = 50

interface FeatureRow {
  key: number
  label: string
  geomType: string
  props: Record<string, unknown>
  feature: GeoJSON.Feature
}

interface PropRow {
  key: string
  value: string
}

export default function FeaturePanel(): ReactElement {
  const layers = useLayerStore((s) => s.layers)
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId)
  const selectedFeatureProps = useLayerStore((s) => s.selectedFeatureProps)
  const setSelectedFeatureProps = useLayerStore((s) => s.setSelectedFeatureProps)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)

  const [tablePage, setTablePage] = useState(1)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId]
  )

  const featureRows = useMemo<FeatureRow[]>(() => {
    if (!selectedLayer || selectedLayer.type !== 'geojson') return []
    const fc = selectedLayer.source as GeoJSON.FeatureCollection
    return fc.features.map((f, i) => ({
      key: i,
      label: (f.properties?._feature_label as string) ?? `要素 ${i + 1}`,
      geomType: f.geometry.type,
      props: (f.properties ?? {}) as Record<string, unknown>,
      feature: f,
    }))
  }, [selectedLayer])

  // Reset to page 1 when layer changes
  useEffect(() => {
    setTablePage(1)
  }, [selectedLayerId])

  const selectedRowKey = useMemo(() => {
    if (!selectedFeatureProps) return undefined
    const idx = featureRows.findIndex((r) => matchesSelectedProps(r.props, selectedFeatureProps))
    return idx >= 0 ? idx : undefined
  }, [featureRows, selectedFeatureProps])

  // When map click selects a feature: switch to its page and scroll the row into view
  useEffect(() => {
    if (selectedRowKey === undefined) return
    const targetPage = Math.floor(selectedRowKey / PAGE_SIZE) + 1
    setTablePage(targetPage)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!tableContainerRef.current) return
        const rows = tableContainerRef.current.querySelectorAll<HTMLElement>('tr.yutu-feature-row')
        const indexOnPage = selectedRowKey - (targetPage - 1) * PAGE_SIZE
        rows[indexOnPage]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    })
  }, [selectedRowKey])

  const handleRowClick = (row: FeatureRow) => {
    setSelectedFeatureProps(row.props)
    const bounds = getFeatureBounds(row.feature)
    if (bounds) requestFitBounds(bounds)
  }

  const propRows = useMemo<PropRow[]>(() => {
    if (!selectedFeatureProps) return []
    return Object.entries(selectedFeatureProps).map(([k, v]) => ({
      key: k,
      value: v === null || v === undefined ? '' : String(v),
    }))
  }, [selectedFeatureProps])

  const totalPages = Math.ceil(featureRows.length / PAGE_SIZE)
  const currentFeatures = featureRows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE)

  const getGeomIntent = (geomType: string) => {
    if (geomType.includes('Polygon')) return Intent.PRIMARY
    if (geomType.includes('Line')) return Intent.SUCCESS
    return Intent.WARNING
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-border, #d9dce0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--color-bg-panel, #f5f6f8)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>要素属性</span>
        {selectedLayer && (
          <span className={Classes.TEXT_MUTED} style={{ fontSize: 11 }}>
            {featureRows.length} 个要素
          </span>
        )}
      </div>

      {!selectedLayer ? (
        <div style={{ padding: '40px 16px', flex: 1, display: 'flex', alignItems: 'center' }}>
          <NonIdealState
            icon="select"
            title="请选择图层"
            description="在左侧图层面板选中一个矢量图层以查看要素"
            iconSize={32}
          />
        </div>
      ) : (
        <>
          {/* Upper Section: Feature List */}
          <div
            ref={tableContainerRef}
            style={{
              flex: '0 0 45%',
              overflowY: 'auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <HTMLTable compact interactive style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 8px' }}>要素名称</th>
                  <th style={{ width: 80, padding: '6px 8px' }}>类型</th>
                </tr>
              </thead>
              <tbody>
                {currentFeatures.map((row) => {
                  const isSelected = row.key === selectedRowKey
                  return (
                    <tr
                      key={row.key}
                      className="yutu-feature-row"
                      onClick={() => handleRowClick(row)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--color-bg-selected, #e4edf6)' : undefined,
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      <td
                        style={{
                          padding: '5px 8px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 160,
                        }}
                      >
                        {row.label}
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <Tag
                          minimal
                          round
                          intent={getGeomIntent(row.geomType)}
                          style={{ fontSize: 10, minHeight: 16, height: 16, padding: '0 6px' }}
                        >
                          {row.geomType}
                        </Tag>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </HTMLTable>

            {/* Pagination if needed */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderTop: '1px solid var(--color-border, #d9dce0)',
                  marginTop: 'auto',
                  fontSize: 11,
                }}
              >
                <span className={Classes.TEXT_MUTED}>
                  {tablePage} / {totalPages}
                </span>
                <ButtonGroup variant="minimal">
                  <Button
                    icon="chevron-left"
                    size="small"
                    disabled={tablePage <= 1}
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  />
                  <Button
                    icon="chevron-right"
                    size="small"
                    disabled={tablePage >= totalPages}
                    onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                  />
                </ButtonGroup>
              </div>
            )}
          </div>

          <Divider style={{ margin: 0, flexShrink: 0 }} />

          {/* Lower Section: Properties Table */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!selectedFeatureProps ? (
              <div
                className={Classes.TEXT_MUTED}
                style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12 }}
              >
                点击地图或列表中的要素查看属性
              </div>
            ) : (
              <HTMLTable compact striped style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: '40%', padding: '6px 8px' }}>属性</th>
                    <th style={{ padding: '6px 8px' }}>值</th>
                  </tr>
                </thead>
                <tbody>
                  {propRows.map((prop) => (
                    <tr key={prop.key}>
                      <td
                        style={{
                          padding: '5px 8px',
                          color: prop.key.startsWith('_') ? '#8f959e' : 'inherit',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 100,
                        }}
                      >
                        {prop.key}
                      </td>
                      <td
                        style={{
                          padding: '5px 8px',
                          wordBreak: 'break-all',
                        }}
                      >
                        {prop.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </div>
        </>
      )}
    </div>
  )
}
