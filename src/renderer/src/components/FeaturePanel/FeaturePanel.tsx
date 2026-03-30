import { useMemo, useEffect, useRef, useState } from 'react'
import { Table, Tag, Typography, Empty, Divider } from 'antd'
import type { TableProps } from 'antd'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { getGeoJSONBounds } from '../../utils/geo'

const { Text } = Typography
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

function matchesSelected(
  props: Record<string, unknown>,
  selected: Record<string, unknown> | null,
): boolean {
  if (!selected) return false
  if (props._osm_id !== undefined && selected._osm_id !== undefined) {
    return props._osm_id === selected._osm_id && props._osm_type === selected._osm_type
  }
  return JSON.stringify(props) === JSON.stringify(selected)
}

function getFeatureBounds(
  feature: GeoJSON.Feature,
): [[number, number], [number, number]] | null {
  const bounds = getGeoJSONBounds({ type: 'FeatureCollection', features: [feature] })
  if (!bounds) return null
  const [[minLon, minLat], [maxLon, maxLat]] = bounds
  // Point: add buffer so fitBounds has a meaningful area
  if (minLon === maxLon && minLat === maxLat) {
    const d = 0.005
    return [[minLon - d, minLat - d], [maxLon + d, maxLat + d]]
  }
  return bounds
}

export default function FeaturePanel() {
  const layers = useLayerStore((s) => s.layers)
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId)
  const selectedFeatureProps = useLayerStore((s) => s.selectedFeatureProps)
  const setSelectedFeatureProps = useLayerStore((s) => s.setSelectedFeatureProps)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)

  const [tablePage, setTablePage] = useState(1)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId),
    [layers, selectedLayerId],
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
    const idx = featureRows.findIndex((r) => matchesSelected(r.props, selectedFeatureProps))
    return idx >= 0 ? idx : undefined
  }, [featureRows, selectedFeatureProps])

  // When map click selects a feature: switch to its page and scroll the row into view
  useEffect(() => {
    if (selectedRowKey === undefined) return
    const targetPage = Math.floor(selectedRowKey / PAGE_SIZE) + 1
    setTablePage(targetPage)
    // Double rAF: first waits for React state flush, second waits for DOM paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!tableContainerRef.current) return
        const rows = tableContainerRef.current.querySelectorAll<HTMLElement>('tr.ant-table-row')
        const indexOnPage = selectedRowKey - (targetPage - 1) * PAGE_SIZE
        rows[indexOnPage]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    })
  }, [selectedRowKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const featureCols: TableProps<FeatureRow>['columns'] = [
    { title: '要素名称', dataIndex: 'label', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'geomType',
      width: 80,
      render: (v: string) => {
        const color = v === 'Polygon' ? 'blue' : v === 'LineString' ? 'green' : 'orange'
        return <Tag color={color} style={{ fontSize: 11 }}>{v}</Tag>
      },
    },
  ]

  const propCols: TableProps<PropRow>['columns'] = [
    {
      title: '属性',
      dataIndex: 'key',
      width: '40%',
      ellipsis: true,
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: v.startsWith('_') ? '#aaa' : undefined }}>{v}</Text>
      ),
    },
    {
      title: '值',
      dataIndex: 'value',
      ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 8px 4px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Text strong style={{ fontSize: 13 }}>要素属性</Text>
        {selectedLayer && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {featureRows.length} 个要素
          </Text>
        )}
      </div>

      {!selectedLayer ? (
        <Empty description="请选择图层" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 32 }} />
      ) : (
        <>
          {/* Feature list */}
          <div ref={tableContainerRef} style={{ flex: '0 0 45%', overflow: 'auto', minHeight: 0 }}>
            <Table
              size="small"
              columns={featureCols}
              dataSource={featureRows}
              pagination={
                featureRows.length > PAGE_SIZE
                  ? { pageSize: PAGE_SIZE, size: 'small', current: tablePage, onChange: setTablePage }
                  : false
              }
              onRow={(row) => ({
                style: {
                  cursor: 'pointer',
                  background: row.key === selectedRowKey ? '#e6f4ff' : undefined,
                },
                onClick: () => handleRowClick(row),
              })}
            />
          </div>

          <Divider style={{ margin: 0, flexShrink: 0 }} />

          {/* Properties */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {!selectedFeatureProps ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: '#aaa', fontSize: 12 }}>
                点击地图或列表中的要素查看属性
              </div>
            ) : (
              <Table
                size="small"
                columns={propCols}
                dataSource={propRows}
                pagination={false}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
