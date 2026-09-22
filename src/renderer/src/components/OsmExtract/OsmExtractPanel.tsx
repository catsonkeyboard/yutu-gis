import { useMemo, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { nanoid } from 'nanoid'
import {
  Button,
  Callout,
  Checkbox,
  Classes,
  Divider,
  HTMLTable,
  Icon,
  Intent,
  SegmentedControl,
  Tag,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { osmExtract } from '../../services/api'
import { useOsmPanelStore } from '../../stores/osmPanelStore'
import { useMapStore } from '../../stores/mapStore'
import { useLayerStore } from '../../stores/layerStore'
import { useMapBboxSelect, viewportBbox } from '../../hooks/useMapBboxSelect'
import BboxSelector from '../common/BboxSelector'
import { getGeoJSONBounds } from '../../utils/geo'
import i18n from '../../i18n'
import { message } from '../../utils/toaster'

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

function getFeatureLabel(props: Record<string, unknown>, geomType: string): string {
  if (props.name) return String(props.name)
  if (props.ref) return String(props.ref)
  return geomType
}

const CATEGORY_LABEL: Record<string, string> = {
  building: '建筑',
  highway: '道路',
  landuse: '用地',
  amenity: '设施',
  leisure: '休闲',
  natural: '自然',
  aeroway: '机场',
  other: '其他',
}

interface Props {
  map: maplibregl.Map | null
}

export default function OsmExtractPanel({ map }: Props) {
  const { t } = useTranslation()
  const open = useOsmPanelStore((s) => s.open)
  const setOpen = useOsmPanelStore((s) => s.setOpen)
  const bbox = useOsmPanelStore((s) => s.bbox)
  const setBbox = useOsmPanelStore((s) => s.setBbox)
  const selecting = useOsmPanelStore((s) => s.selecting)
  const setSelecting = useOsmPanelStore((s) => s.setSelecting)
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const defaultProvider = useMapStore((s) => s.provider)

  useMapBboxSelect({
    map,
    active: open,
    bbox,
    selecting,
    setBbox,
    setSelecting,
    sourceId: 'osm-bbox',
    color: '#d4880f',
    provider: defaultProvider,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OsmFeature[]>([])
  const [queried, setQueried] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [activeSubCategory, setActiveSubCategory] = useState<string>('all')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [importMode, setImportMode] = useState<'single' | 'split'>('single')

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(r.category)
    return Array.from(set)
  }, [rows])

  const subCategories = useMemo(() => {
    if (activeCategory === 'all') return []
    const set = new Set<string>()
    for (const r of rows) {
      if (r.category === activeCategory) set.add(r.subCategory)
    }
    return Array.from(set)
  }, [rows, activeCategory])

  const visibleRows = useMemo(() => {
    if (activeCategory === 'all') return rows
    const byCat = rows.filter((r) => r.category === activeCategory)
    if (activeSubCategory === 'all') return byCat
    return byCat.filter((r) => r.subCategory === activeSubCategory)
  }, [rows, activeCategory, activeSubCategory])

  const handleExtract = async () => {
    if (!bbox) return
    setLoading(true)
    setError(null)
    setRows([])
    setSelectedKeys([])
    setQueried(false)
    try {
      const fc = await osmExtract(bbox[0], bbox[1], bbox[2], bbox[3])
      const parsed: OsmFeature[] = fc.features.map((f, i) => {
        const props = (f.properties ?? {}) as Record<string, unknown>
        const geomType = f.geometry.type
        const cat = getCategory(props)
        return {
          key: String(f.id ?? i),
          label: getFeatureLabel(props, geomType),
          category: cat,
          subCategory: getSubCategory(props, cat),
          geomType,
          feature: f,
        }
      })
      setRows(parsed)
      setSelectedKeys(parsed.map((r) => r.key))
      setActiveCategory('all')
      setActiveSubCategory('all')
      setQueried(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

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

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#646a73',
    margin: '6px 0 3px',
  }

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedKeys.includes(r.key))

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleKeySet = new Set(visibleRows.map((r) => r.key))
      setSelectedKeys(selectedKeys.filter((k) => !visibleKeySet.has(k)))
    } else {
      const newKeys = Array.from(new Set([...selectedKeys, ...visibleRows.map((r) => r.key)]))
      setSelectedKeys(newKeys)
    }
  }

  const getGeomIntent = (v: string) => {
    if (v.includes('Polygon')) return Intent.PRIMARY
    if (v.includes('Line')) return Intent.SUCCESS
    return Intent.WARNING
  }

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
          <Icon icon="flash" size={14} />
          <span>{t('osm.menuItem')}</span>
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
          disabled={loading}
        />
      </div>

      <Button
        intent={Intent.PRIMARY}
        size="small"
        icon="flash"
        loading={loading}
        disabled={!bbox || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]}
        onClick={handleExtract}
        style={{ width: '100%', marginBottom: 8 }}
        text={loading ? t('osm.loading') : '提取要素'}
      />

      {error && (
        <Callout intent={Intent.DANGER} title={t('osm.errorTitle')} style={{ marginBottom: 8 }}>
          {error}
        </Callout>
      )}

      {!loading && !error && queried && rows.length === 0 && (
        <div className={Classes.TEXT_MUTED} style={{ textAlign: 'center', padding: '12px 0', fontSize: 12 }}>
          {t('osm.noFeatures')}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            <Tag
              interactive
              round
              minimal={activeCategory !== 'all'}
              intent={activeCategory === 'all' ? Intent.PRIMARY : undefined}
              onClick={() => handleCategoryClick('all')}
              style={{ fontSize: 11, cursor: 'pointer' }}
            >
              全部 ({rows.length})
            </Tag>
            {categories.map((cat) => (
              <Tag
                key={cat}
                interactive
                round
                minimal={activeCategory !== cat}
                intent={activeCategory === cat ? Intent.PRIMARY : undefined}
                onClick={() => handleCategoryClick(cat)}
                style={{ fontSize: 11, cursor: 'pointer' }}
              >
                {CATEGORY_LABEL[cat] ?? cat} ({rows.filter((r) => r.category === cat).length})
              </Tag>
            ))}
          </div>

          {activeCategory !== 'all' && subCategories.length > 1 && (
            <>
              <Divider style={{ margin: '6px 0' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                <Tag
                  interactive
                  round
                  minimal={activeSubCategory !== 'all'}
                  intent={activeSubCategory === 'all' ? Intent.PRIMARY : undefined}
                  onClick={() => handleSubCategoryClick('all')}
                  style={{ fontSize: 11, cursor: 'pointer' }}
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
                      interactive
                      round
                      minimal={activeSubCategory !== sub}
                      intent={activeSubCategory === sub ? Intent.PRIMARY : undefined}
                      onClick={() => handleSubCategoryClick(sub)}
                      style={{ fontSize: 11, cursor: 'pointer' }}
                    >
                      {sub} ({count})
                    </Tag>
                  )
                })}
              </div>
            </>
          )}

          {/* Feature List Table */}
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8, border: '1px solid #d9dce0', borderRadius: 3 }}>
            <HTMLTable compact interactive style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 28, padding: '4px 6px' }}>
                    <Checkbox
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      style={{ marginBottom: 0 }}
                    />
                  </th>
                  <th style={{ padding: '4px 6px' }}>{t('osm.colName')}</th>
                  <th style={{ width: 80, padding: '4px 6px' }}>{t('osm.colGeom')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isChecked = selectedKeys.includes(row.key)
                  const hasName = Boolean(row.feature.properties?.name || row.feature.properties?.ref)
                  return (
                    <tr
                      key={row.key}
                      onClick={() => {
                        setSelectedKeys(
                          isChecked
                            ? selectedKeys.filter((k) => k !== row.key)
                            : [...selectedKeys, row.key]
                        )
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ padding: '4px 6px' }} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isChecked}
                          onChange={() => {
                            setSelectedKeys(
                              isChecked
                                ? selectedKeys.filter((k) => k !== row.key)
                                : [...selectedKeys, row.key]
                            )
                          }}
                          style={{ marginBottom: 0 }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span>{row.label}</span>
                        {!hasName && (
                          <span className={Classes.TEXT_MUTED} style={{ marginLeft: 4, fontSize: 10 }}>
                            (未命名)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <Tag
                          minimal
                          round
                          intent={getGeomIntent(row.geomType)}
                          style={{ fontSize: 9, minHeight: 14, height: 14, padding: '0 4px' }}
                        >
                          {row.geomType}
                        </Tag>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </HTMLTable>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <SegmentedControl
              small
              options={[
                { label: '单图层', value: 'single' },
                { label: '按子类型拆分', value: 'split' },
              ]}
              value={importMode}
              onValueChange={(val) => setImportMode(val as 'single' | 'split')}
              disabled={selectedKeys.length === 0 || loading}
            />
            <Button
              intent={Intent.PRIMARY}
              size="small"
              disabled={selectedKeys.length === 0 || loading}
              onClick={handleImport}
              text={`${t('osm.importSelected')} (${selectedKeys.length})`}
            />
          </div>
        </>
      )}
    </div>
  )
}
