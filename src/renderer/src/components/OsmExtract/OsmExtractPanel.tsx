import { useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { nanoid } from 'nanoid'
import { Table, Alert, Button, Tag, Space, Divider, Segmented, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { CloseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { osmExtract } from '../../services/api'
import { useOsmPanelStore } from '../../stores/osmPanelStore'
import { useMapStore } from '../../stores/mapStore'
import { useLayerStore } from '../../stores/layerStore'
import { useMapBboxSelect, viewportBbox } from '../../hooks/useMapBboxSelect'
import BboxSelector from '../common/BboxSelector'
import { getGeoJSONBounds } from '../../utils/geo'
import i18n from '../../i18n'

const { Text } = Typography

interface OsmFeature {
  key: string
  label: string
  category: string
  subCategory: string
  geomType: string
  feature: GeoJSON.Feature
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

interface Props {
  map: maplibregl.Map | null
}

export default function OsmExtractPanel({ map }: Props) {
  const { t } = useTranslation()
  const provider = useMapStore((s) => s.provider)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)

  const open = useOsmPanelStore((s) => s.open)
  const bbox = useOsmPanelStore((s) => s.bbox)
  const selecting = useOsmPanelStore((s) => s.selecting)
  const setOpen = useOsmPanelStore((s) => s.setOpen)
  const setBbox = useOsmPanelStore((s) => s.setBbox)
  const setSelecting = useOsmPanelStore((s) => s.setSelecting)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)
  const [rows, setRows] = useState<OsmFeature[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeSubCategory, setActiveSubCategory] = useState<string>('all')
  const [importMode, setImportMode] = useState<'single' | 'split'>('single')

  useMapBboxSelect({
    map, active: open, bbox, selecting, setBbox, setSelecting,
    sourceId: 'osm-extract-bbox', color: '#52c41a', provider
  })

  const handleExtract = async () => {
    if (!bbox) return
    setLoading(true)
    setError(null)
    setQueried(true)
    setRows([])
    setSelectedKeys([])
    setActiveCategory('all')
    setActiveSubCategory('all')
    try {
      const fc = await osmExtract(bbox[0], bbox[1], bbox[2], bbox[3])
      const items: OsmFeature[] = fc.features.map((f, i) => {
        const props = f.properties ?? {}
        const cat = getCategory(props)
        return {
          key: `${props._osm_type}-${props._osm_id}-${i}`,
          label: (props._feature_label as string) ?? t('osm.colName'),
          category: cat,
          subCategory: getSubCategory(props, cat),
          geomType: f.geometry.type,
          feature: f,
        }
      })
      setRows(items)
      setSelectedKeys(items.map((r) => r.key))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const categories = useMemo(() => {
    const present = new Set(rows.map((r) => r.category))
    return TAG_KEYS.filter((k) => present.has(k)).concat(present.has('other') ? ['other'] : [])
  }, [rows])

  const subCategories = useMemo(() => {
    if (activeCategory === 'all') return []
    const catRows = rows.filter((r) => r.category === activeCategory)
    const counts: Record<string, number> = {}
    for (const r of catRows) counts[r.subCategory] = (counts[r.subCategory] ?? 0) + 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([sub]) => sub)
  }, [rows, activeCategory])

  const visibleRows = useMemo(() => {
    if (activeCategory === 'all') return rows
    const catRows = rows.filter((r) => r.category === activeCategory)
    if (activeSubCategory === 'all') return catRows
    return catRows.filter((r) => r.subCategory === activeSubCategory)
  }, [rows, activeCategory, activeSubCategory])

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat)
    setActiveSubCategory('all')
    const target = cat === 'all' ? rows : rows.filter((r) => r.category === cat)
    setSelectedKeys(target.map((r) => r.key))
  }

  const handleSubCategoryClick = (sub: string) => {
    setActiveSubCategory(sub)
    const base = rows.filter((r) => r.category === activeCategory)
    const target = sub === 'all' ? base : base.filter((r) => r.subCategory === sub)
    setSelectedKeys(target.map((r) => r.key))
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
      width: 96,
      render: (v: string) => {
        const color = v === 'Polygon' ? 'blue' : v === 'LineString' ? 'green' : 'orange'
        return <Tag color={color}>{v}</Tag>
      },
    },
  ]

  const handleImport = () => {
    const selected = rows.filter((r) => selectedKeys.includes(r.key))

    let layers: { fc: GeoJSON.FeatureCollection; name: string }[]
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

    let lastId = ''
    for (const { fc, name } of layers) {
      const id = nanoid()
      addLayer({ id, name, type: 'geojson', source: fc, visible: true, opacity: 1 })
      lastId = id
    }
    if (lastId) setSelectedLayer(lastId)
    const allFeatures = layers.flatMap((l) => l.fc.features)
    const bounds = getGeoJSONBounds({ type: 'FeatureCollection', features: allFeatures })
    if (bounds) requestFitBounds(bounds)
    if (layers.length === 1) {
      message.success(i18n.t('osm.importSuccess', { name: layers[0].name, count: allFeatures.length }))
    } else {
      message.success(`已导入 ${layers.length} 个图层，共 ${allFeatures.length} 个要素`)
    }
    handleClose()
  }

  const handleClose = () => {
    setRows([])
    setSelectedKeys([])
    setError(null)
    setQueried(false)
    setOpen(false)
  }

  if (!open) return null

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#646a73', marginBottom: 4 }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 360,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 600,
        padding: '10px 14px 14px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <Text strong style={{ flex: 1, fontSize: 13 }}>
          <ThunderboltOutlined style={{ marginRight: 6 }} />
          {t('osm.menuItem')}
        </Text>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleClose} />
      </div>

      <div style={labelStyle}>范围（WGS-84）</div>
      <div style={{ marginBottom: 8 }}>
        <BboxSelector
          bbox={bbox}
          onChange={setBbox}
          selecting={selecting}
          onToggleSelecting={() => setSelecting(!selecting)}
          onUseViewport={() => map && setBbox(viewportBbox(map))}
          disabled={loading}
        />
      </div>

      <Button
        type="primary"
        size="small"
        icon={<ThunderboltOutlined />}
        loading={loading}
        disabled={!bbox || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]}
        onClick={handleExtract}
        style={{ width: '100%', marginBottom: 8 }}
      >
        {loading ? t('osm.loading') : '提取要素'}
      </Button>

      {error && (
        <Alert type="error" message={t('osm.errorTitle')} description={error} showIcon
          style={{ marginBottom: 8 }} />
      )}
      {!loading && !error && queried && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#888', fontSize: 12 }}>
          {t('osm.noFeatures')}
        </div>
      )}

      {rows.length > 0 && (
        <>
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
            scroll={{ y: 220 }}
            style={{ marginBottom: 8 }}
          />

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
            <Button
              type="primary"
              size="small"
              disabled={selectedKeys.length === 0 || loading}
              onClick={handleImport}
            >
              {t('osm.importSelected')} ({selectedKeys.length})
            </Button>
          </Space>
        </>
      )}
    </div>
  )
}
