import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, InputNumber, Modal, Select, Space, Typography, message } from 'antd'
import { CloseOutlined, ExperimentOutlined } from '@ant-design/icons'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { useAnalysisPanelStore } from '../../stores/analysisPanelStore'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { runAnalysis, parseApiError, type AnalysisOp, type AnalysisParams } from '../../services/api'
import { getGeoJSONBounds } from '../../utils/geo'
import { deriveColumns } from '../AttributeTable/tableUtils'

const { Text } = Typography

const LARGE_FEATURE_WARN = 50000

interface OpDef {
  needsSecondary: boolean
  param?: 'distance' | 'tolerance' | 'field' | 'predicate'
}

const OPS: Record<AnalysisOp, OpDef> = {
  buffer: { needsSecondary: false, param: 'distance' },
  centroid: { needsSecondary: false },
  convex_hull: { needsSecondary: false },
  simplify: { needsSecondary: false, param: 'tolerance' },
  dissolve: { needsSecondary: false, param: 'field' },
  clip: { needsSecondary: true },
  intersection: { needsSecondary: true },
  difference: { needsSecondary: true },
  union: { needsSecondary: true },
  select_by_location: { needsSecondary: true, param: 'predicate' },
}

export default function AnalysisPanel(): ReactElement | null {
  const { t } = useTranslation()
  const open = useAnalysisPanelStore((s) => s.open)
  const setOpen = useAnalysisPanelStore((s) => s.setOpen)
  const layers = useLayerStore((s) => s.layers)
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)

  const [op, setOp] = useState<AnalysisOp>('buffer')
  const [primaryId, setPrimaryId] = useState<string | undefined>(undefined)
  const [secondaryId, setSecondaryId] = useState<string | undefined>(undefined)
  const [distance, setDistance] = useState<number>(500)
  const [tolerance, setTolerance] = useState<number>(100)
  const [field, setField] = useState<string | undefined>(undefined)
  const [predicate, setPredicate] = useState<AnalysisParams['predicate']>('intersects')
  const [running, setRunning] = useState(false)

  const vectorLayers = useMemo(() => layers.filter((l) => l.type === 'geojson'), [layers])
  const layerOptions = vectorLayers.map((l) => ({ value: l.id, label: l.name }))
  const def = OPS[op]

  const primaryLayer = vectorLayers.find((l) => l.id === primaryId)
  const fieldOptions = useMemo(() => {
    if (!primaryLayer) return []
    const fc = primaryLayer.source as GeoJSON.FeatureCollection
    return deriveColumns(fc.features).columns.map((c) => ({ value: c.key, label: c.key }))
  }, [primaryLayer])

  const opOptions = [
    {
      label: t('analysis.groupGeometry'),
      options: (['buffer', 'centroid', 'convex_hull', 'simplify', 'dissolve'] as const).map((v) => ({
        value: v,
        label: t(`analysis.op.${v}`),
      })),
    },
    {
      label: t('analysis.groupOverlay'),
      options: (['clip', 'intersection', 'difference', 'union'] as const).map((v) => ({
        value: v,
        label: t(`analysis.op.${v}`),
      })),
    },
    {
      label: t('analysis.groupSelect'),
      options: [{ value: 'select_by_location' as const, label: t('analysis.op.select_by_location') }],
    },
  ]

  if (!open) return null

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#646a73', marginBottom: 4 }

  const execute = async () => {
    const primary = vectorLayers.find((l) => l.id === primaryId)
    if (!primary) {
      message.warning(t('analysis.selectPrimary'))
      return
    }
    const secondary = def.needsSecondary ? vectorLayers.find((l) => l.id === secondaryId) : undefined
    if (def.needsSecondary && !secondary) {
      message.warning(t('analysis.selectSecondary'))
      return
    }
    const primaryFc = primary.source as GeoJSON.FeatureCollection
    const secondaryFc = (secondary?.source as GeoJSON.FeatureCollection) ?? null
    const total = primaryFc.features.length + (secondaryFc?.features.length ?? 0)
    if (total > LARGE_FEATURE_WARN) {
      const ok = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: t('analysis.largeWarnTitle'),
          content: t('analysis.largeWarn', { count: total }),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!ok) return
    }

    const params: AnalysisParams = {}
    if (def.param === 'distance') params.distance = distance
    if (def.param === 'tolerance') params.tolerance = tolerance
    if (def.param === 'field' && field) params.field = field
    if (def.param === 'predicate') params.predicate = predicate

    setRunning(true)
    try {
      const result = await runAnalysis(op, primaryFc, secondaryFc, params)
      if (result.skipped) {
        message.warning(t('analysis.skipped', { count: result.skipped }))
      }
      if (!result.features.length) {
        message.info(t('analysis.emptyResult'))
        return
      }
      const suffix = op === 'buffer' ? `_${distance}m` : ''
      const name = `${t(`analysis.op.${op}`)}_${primary.name}${suffix}`
      const id = nanoid()
      addLayer({
        id,
        name,
        type: 'geojson',
        source: { type: 'FeatureCollection', features: result.features },
        visible: true,
        opacity: 1,
      })
      setSelectedLayer(id)
      const bounds = getGeoJSONBounds(result)
      if (bounds) requestFitBounds(bounds)
      message.success(t('analysis.done', { name, count: result.features.length }))
    } catch (e) {
      message.error(`${t('analysis.failed')}：${parseApiError(e)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 320,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 600,
        padding: '10px 14px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <Text strong style={{ flex: 1, fontSize: 13 }}>
          <ExperimentOutlined style={{ marginRight: 6 }} />
          {t('analysis.title')}
        </Text>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
      </div>

      <div style={labelStyle}>{t('analysis.operation')}</div>
      <Select
        style={{ width: '100%', marginBottom: 8 }}
        value={op}
        onChange={(v) => setOp(v)}
        options={opOptions}
        size="small"
      />

      <div style={labelStyle}>{t('analysis.primaryLayer')}</div>
      <Select
        style={{ width: '100%', marginBottom: 8 }}
        value={primaryId}
        onChange={(v) => {
          setPrimaryId(v)
          setField(undefined)
        }}
        options={layerOptions}
        placeholder={t('analysis.selectPrimary')}
        size="small"
        showSearch
        optionFilterProp="label"
      />

      {def.needsSecondary && (
        <>
          <div style={labelStyle}>{t('analysis.secondaryLayer')}</div>
          <Select
            style={{ width: '100%', marginBottom: 8 }}
            value={secondaryId}
            onChange={setSecondaryId}
            options={layerOptions.filter((o) => o.value !== primaryId)}
            placeholder={t('analysis.selectSecondary')}
            size="small"
            showSearch
            optionFilterProp="label"
          />
        </>
      )}

      {def.param === 'distance' && (
        <>
          <div style={labelStyle}>{t('analysis.distance')}</div>
          <InputNumber
            style={{ width: '100%', marginBottom: 8 }}
            value={distance}
            onChange={(v) => setDistance(v ?? 0)}
            step={100}
            size="small"
            addonAfter="m"
          />
        </>
      )}

      {def.param === 'tolerance' && (
        <>
          <div style={labelStyle}>{t('analysis.tolerance')}</div>
          <InputNumber
            style={{ width: '100%', marginBottom: 8 }}
            value={tolerance}
            onChange={(v) => setTolerance(v ?? 0)}
            min={0}
            step={10}
            size="small"
            addonAfter="m"
          />
        </>
      )}

      {def.param === 'field' && (
        <>
          <div style={labelStyle}>{t('analysis.dissolveField')}</div>
          <Select
            style={{ width: '100%', marginBottom: 8 }}
            value={field}
            onChange={setField}
            options={fieldOptions}
            placeholder={t('analysis.dissolveAll')}
            size="small"
            allowClear
            showSearch
          />
        </>
      )}

      {def.param === 'predicate' && (
        <>
          <div style={labelStyle}>{t('analysis.predicate')}</div>
          <Select
            style={{ width: '100%', marginBottom: 8 }}
            value={predicate}
            onChange={setPredicate}
            size="small"
            options={(['intersects', 'within', 'contains', 'disjoint'] as const).map((p) => ({
              value: p,
              label: t(`analysis.predicates.${p}`),
            }))}
          />
        </>
      )}

      <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 4 }}>
        <Button type="primary" size="small" loading={running} onClick={execute}>
          {t('analysis.run')}
        </Button>
      </Space>
    </div>
  )
}
