// src/renderer/src/components/OsmExtract/OsmExtractModal.tsx
import { useState, useEffect, useMemo } from 'react'
import { Modal, Table, Spin, Alert, Button, Tag, Space, Divider, Segmented } from 'antd'
import type { TableProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { osmExtract } from '../../services/api'

interface OsmFeature {
  key: string
  label: string
  category: string
  subCategory: string
  geomType: string
  feature: GeoJSON.Feature
}

interface ImportLayer {
  fc: GeoJSON.FeatureCollection
  name: string
}

interface Props {
  open: boolean
  bounds: [number, number, number, number] | null // [south, west, north, east]
  onClose: () => void
  onImport: (layers: ImportLayer[]) => void
}

const TAG_KEYS = ['aeroway', 'building', 'highway', 'landuse', 'amenity', 'leisure', 'natural']

function getCategory(props: Record<string, unknown>): string {
  for (const key of TAG_KEYS) {
    if (props[key]) return key
  }
  return 'other'
}

function getSubCategory(props: Record<string, unknown>, category: string): string {
  if (category === 'other') return 'other'
  const val = props[category]
  return typeof val === 'string' && val !== 'yes' ? val : category
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

const TAG_STYLE: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' }

export default function OsmExtractModal({ open, bounds, onClose, onImport }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OsmFeature[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeSubCategory, setActiveSubCategory] = useState<string>('all')
  const [importMode, setImportMode] = useState<'single' | 'split'>('single')

  useEffect(() => {
    if (!open || !bounds) return
    setLoading(true)
    setError(null)
    setRows([])
    setSelectedKeys([])
    setActiveCategory('all')
    setActiveSubCategory('all')

    osmExtract(bounds[0], bounds[1], bounds[2], bounds[3])
      .then((fc) => {
        const items: OsmFeature[] = fc.features.map((f, i) => {
          const props = f.properties ?? {}
          const cat = getCategory(props)
          return {
            key: `${props._osm_type}-${props._osm_id}-${i}`,
            label: props._feature_label ?? t('osm.colName'),
            category: cat,
            subCategory: getSubCategory(props, cat),
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

  // Top-level categories present in results
  const categories = useMemo(() => {
    const present = new Set(rows.map((r) => r.category))
    return TAG_KEYS.filter((k) => present.has(k)).concat(present.has('other') ? ['other'] : [])
  }, [rows])

  // Sub-categories for the active category (sorted by count desc)
  const subCategories = useMemo(() => {
    if (activeCategory === 'all') return []
    const catRows = rows.filter((r) => r.category === activeCategory)
    const counts: Record<string, number> = {}
    for (const r of catRows) counts[r.subCategory] = (counts[r.subCategory] ?? 0) + 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([sub]) => sub)
  }, [rows, activeCategory])

  // Rows shown in the table
  const visibleRows = useMemo(() => {
    if (activeCategory === 'all') return rows
    const catRows = rows.filter((r) => r.category === activeCategory)
    if (activeSubCategory === 'all') return catRows
    return catRows.filter((r) => r.subCategory === activeSubCategory)
  }, [rows, activeCategory, activeSubCategory])

  const selectRows = (targetRows: OsmFeature[]) => {
    setSelectedKeys(targetRows.map((r) => r.key))
  }

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat)
    setActiveSubCategory('all')
    selectRows(cat === 'all' ? rows : rows.filter((r) => r.category === cat))
  }

  const handleSubCategoryClick = (sub: string) => {
    setActiveSubCategory(sub)
    const base = rows.filter((r) => r.category === activeCategory)
    selectRows(sub === 'all' ? base : base.filter((r) => r.subCategory === sub))
  }

  const columns: TableProps<OsmFeature>['columns'] = [
    {
      title: t('osm.colName'),
      dataIndex: 'label',
      ellipsis: true,
      render: (label: string, row: OsmFeature) => {
        const hasName = !!(row.feature.properties?.name || row.feature.properties?.ref)
        return (
          <span>
            {label}
            {!hasName && (
              <Tag style={{ marginLeft: 4, fontSize: 11 }} color="default">
                未命名
              </Tag>
            )}
          </span>
        )
      },
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
    const selected = rows.filter((r) => selectedKeys.includes(r.key))

    let layers: ImportLayer[]
    if (importMode === 'single') {
      layers = [
        {
          fc: { type: 'FeatureCollection', features: selected.map((r) => r.feature) },
          name: t('osm.layerNamePrefix'),
        },
      ]
    } else {
      const groups = new Map<string, OsmFeature[]>()
      for (const row of selected) {
        const key = `${row.category}__${row.subCategory}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }
      layers = Array.from(groups.entries()).map(([key, groupRows]) => {
        const [cat, sub] = key.split('__')
        const catLabel = CATEGORY_LABEL[cat] ?? cat
        const name = sub === cat ? `OSM ${catLabel}` : `OSM ${catLabel}-${sub}`
        return {
          fc: { type: 'FeatureCollection', features: groupRows.map((r) => r.feature) },
          name,
        }
      })
    }

    onImport(layers)
    onClose()
  }

  const footer = (
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Segmented
        size="small"
        value={importMode}
        onChange={(v) => setImportMode(v as 'single' | 'split')}
        options={[
          { label: '单图层', value: 'single' },
          { label: '按子类型拆分', value: 'split' },
        ]}
        disabled={selectedKeys.length === 0 || loading}
      />
      <Space>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="primary" disabled={selectedKeys.length === 0 || loading} onClick={handleImport}>
          {t('osm.importSelected')} ({selectedKeys.length})
        </Button>
      </Space>
    </Space>
  )

  return (
    <Modal title={t('osm.modalTitle')} open={open} onCancel={onClose} footer={footer} width={520}>
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
          {/* Level 1: category filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            <Tag
              style={TAG_STYLE}
              color={activeCategory === 'all' ? 'blue' : undefined}
              onClick={() => handleCategoryClick('all')}
            >
              全部 ({rows.length})
            </Tag>
            {categories.map((cat) => (
              <Tag
                key={cat}
                style={TAG_STYLE}
                color={activeCategory === cat ? 'blue' : undefined}
                onClick={() => handleCategoryClick(cat)}
              >
                {CATEGORY_LABEL[cat] ?? cat} ({rows.filter((r) => r.category === cat).length})
              </Tag>
            ))}
          </div>

          {/* Level 2: sub-category filter (only when a category is selected) */}
          {activeCategory !== 'all' && subCategories.length > 1 && (
            <>
              <Divider style={{ margin: '6px 0' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                <Tag
                  style={TAG_STYLE}
                  color={activeSubCategory === 'all' ? 'geekblue' : undefined}
                  onClick={() => handleSubCategoryClick('all')}
                >
                  全部 ({rows.filter((r) => r.category === activeCategory).length})
                </Tag>
                {subCategories.map((sub) => {
                  const count = rows.filter(
                    (r) => r.category === activeCategory && r.subCategory === sub,
                  ).length
                  return (
                    <Tag
                      key={sub}
                      style={TAG_STYLE}
                      color={activeSubCategory === sub ? 'geekblue' : undefined}
                      onClick={() => handleSubCategoryClick(sub)}
                    >
                      {sub} ({count})
                    </Tag>
                  )
                })}
              </div>
            </>
          )}

          <Table
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelectedKeys(keys as string[]),
            }}
            columns={columns}
            dataSource={visibleRows}
            size="small"
            pagination={false}
            scroll={{ y: 280 }}
          />
        </>
      )}
    </Modal>
  )
}
