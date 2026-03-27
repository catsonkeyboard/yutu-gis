// src/renderer/src/components/OsmExtract/OsmExtractModal.tsx
import { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Spin, Alert, Button, Tag, Space } from 'antd'
import type { TableProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { osmExtract } from '../../services/api'

interface OsmFeature {
  key: string
  label: string
  category: string
  geomType: string
  feature: GeoJSON.Feature
}

interface Props {
  open: boolean
  bounds: [number, number, number, number] | null // [south, west, north, east]
  onClose: () => void
  onImport: (fc: GeoJSON.FeatureCollection, name: string) => void
}

const TAG_KEYS = ['building', 'highway', 'landuse', 'amenity', 'leisure', 'natural', 'aeroway']

function getCategory(props: Record<string, unknown>): string {
  for (const key of TAG_KEYS) {
    if (props[key]) return key
  }
  return 'other'
}

const CATEGORY_LABEL: Record<string, string> = {
  building: '建筑',
  highway: '道路',
  landuse: '土地利用',
  amenity: '设施',
  leisure: '休闲',
  natural: '自然',
  aeroway: '航空',
  other: '其他',
}

export default function OsmExtractModal({ open, bounds, onClose, onImport }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OsmFeature[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')

  useEffect(() => {
    if (!open || !bounds) return
    setLoading(true)
    setError(null)
    setRows([])
    setSelectedKeys([])
    setActiveCategory('all')

    osmExtract(bounds[0], bounds[1], bounds[2], bounds[3])
      .then((fc) => {
        const items: OsmFeature[] = fc.features.map((f, i) => {
          const props = f.properties ?? {}
          return {
            key: `${props._osm_type}-${props._osm_id}-${i}`,
            label: props._feature_label ?? t('osm.colName'),
            category: getCategory(props),
            geomType: f.geometry.type,
            feature: f,
          }
        })
        setRows(items)
        setSelectedKeys(items.map((r) => r.key))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, bounds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Categories present in current results (preserves TAG_KEYS order)
  const categories = useMemo(() => {
    const present = new Set(rows.map((r) => r.category))
    return TAG_KEYS.filter((k) => present.has(k)).concat(present.has('other') ? ['other'] : [])
  }, [rows])

  const visibleRows = useMemo(
    () => (activeCategory === 'all' ? rows : rows.filter((r) => r.category === activeCategory)),
    [rows, activeCategory],
  )

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat)
    // Auto-select all rows in the chosen category
    const targetKeys = (cat === 'all' ? rows : rows.filter((r) => r.category === cat)).map(
      (r) => r.key,
    )
    setSelectedKeys(targetKeys)
  }

  const columns: TableProps<OsmFeature>['columns'] = [
    {
      title: t('osm.colName'),
      dataIndex: 'label',
      ellipsis: true,
    },
    {
      title: t('osm.colGeom'),
      dataIndex: 'geomType',
      width: 110,
      render: (v: string) => {
        const color = v === 'Polygon' ? 'blue' : v === 'LineString' ? 'green' : 'orange'
        return <Tag color={color}>{v}</Tag>
      },
    },
  ]

  const handleImport = () => {
    const selected = rows.filter((r) => selectedKeys.includes(r.key)).map((r) => r.feature)
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: selected }
    const name = t('osm.layerNamePrefix')
    onImport(fc, name)
    onClose()
  }

  const footer = (
    <Space>
      <Button onClick={onClose}>{t('common.cancel')}</Button>
      <Button
        type="primary"
        disabled={selectedKeys.length === 0 || loading}
        onClick={handleImport}
      >
        {t('osm.importSelected')} ({selectedKeys.length})
      </Button>
    </Space>
  )

  return (
    <Modal
      title={t('osm.modalTitle')}
      open={open}
      onCancel={onClose}
      footer={footer}
      width={520}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#888', fontSize: 13 }}>{t('osm.loading')}</div>
        </div>
      )}
      {!loading && error && (
        <Alert type="error" message={t('osm.errorTitle')} description={error} showIcon />
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>
          {t('osm.noFeatures')}
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <>
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Tag
              style={{ cursor: 'pointer', userSelect: 'none' }}
              color={activeCategory === 'all' ? 'blue' : undefined}
              onClick={() => handleCategoryClick('all')}
            >
              全部 ({rows.length})
            </Tag>
            {categories.map((cat) => {
              const count = rows.filter((r) => r.category === cat).length
              return (
                <Tag
                  key={cat}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  color={activeCategory === cat ? 'blue' : undefined}
                  onClick={() => handleCategoryClick(cat)}
                >
                  {CATEGORY_LABEL[cat] ?? cat} ({count})
                </Tag>
              )
            })}
          </div>
          <Table
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelectedKeys(keys as string[]),
            }}
            columns={columns}
            dataSource={visibleRows}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />
        </>
      )}
    </Modal>
  )
}
