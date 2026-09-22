import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  Button,
  Classes,
  Divider,
  HTMLSelect,
  Icon,
  Intent,
  NumericInput,
} from '@blueprintjs/core'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { useAnalysisPanelStore } from '../../stores/analysisPanelStore'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { runAnalysis, parseApiError, type AnalysisOp, type AnalysisParams } from '../../services/api'
import { getGeoJSONBounds } from '../../utils/geo'
import { deriveColumns } from '../AttributeTable/tableUtils'
import { message } from '../../utils/toaster'

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
  const [warnAlertOpen, setWarnAlertOpen] = useState(false)
  const [warnFeatureCount, setWarnFeatureCount] = useState(0)
  const [pendingExecution, setPendingExecution] = useState<(() => Promise<void>) | null>(null)

  const vectorLayers = useMemo(() => layers.filter((l) => l.type === 'geojson'), [layers])
  const layerOptions = [
    { value: '', label: t('analysis.selectPrimary') },
    ...vectorLayers.map((l) => ({ value: l.id, label: l.name })),
  ]
  const secondaryLayerOptions = [
    { value: '', label: t('analysis.selectSecondary') },
    ...vectorLayers.filter((l) => l.id !== primaryId).map((l) => ({ value: l.id, label: l.name })),
  ]
  const def = OPS[op]

  const primaryLayer = vectorLayers.find((l) => l.id === primaryId)
  const fieldOptions = useMemo(() => {
    if (!primaryLayer) return [{ value: '', label: t('analysis.dissolveAll') }]
    const fc = primaryLayer.source as GeoJSON.FeatureCollection
    return [
      { value: '', label: t('analysis.dissolveAll') },
      ...deriveColumns(fc.features).columns.map((c) => ({ value: c.key, label: c.key })),
    ]
  }, [primaryLayer, t])

  const opOptions = [
    { value: 'buffer', label: t('analysis.op.buffer') },
    { value: 'centroid', label: t('analysis.op.centroid') },
    { value: 'convex_hull', label: t('analysis.op.convex_hull') },
    { value: 'simplify', label: t('analysis.op.simplify') },
    { value: 'dissolve', label: t('analysis.op.dissolve') },
    { value: 'clip', label: t('analysis.op.clip') },
    { value: 'intersection', label: t('analysis.op.intersection') },
    { value: 'difference', label: t('analysis.op.difference') },
    { value: 'union', label: t('analysis.op.union') },
    { value: 'select_by_location', label: t('analysis.op.select_by_location') },
  ]

  if (!open) return null

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#646a73',
    margin: '6px 0 3px',
  }

  const doRun = async () => {
    const primary = vectorLayers.find((l) => l.id === primaryId)
    if (!primary) return
    const secondary = def.needsSecondary ? vectorLayers.find((l) => l.id === secondaryId) : undefined
    const primaryFc = primary.source as GeoJSON.FeatureCollection
    const secondaryFc = (secondary?.source as GeoJSON.FeatureCollection) ?? null

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
      setWarnFeatureCount(total)
      setPendingExecution(() => doRun)
      setWarnAlertOpen(true)
      return
    }

    await doRun()
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
          <Icon icon="lab-test" size={14} />
          <span>{t('analysis.title')}</span>
        </div>
        <Button size="small" variant="minimal" icon="cross" onClick={() => setOpen(false)} />
      </div>

      <div style={labelStyle}>{t('analysis.operation')}</div>
      <HTMLSelect
        fill
        value={op}
        onChange={(e) => setOp(e.target.value as AnalysisOp)}
        options={opOptions}
        style={{ marginBottom: 6 }}
      />

      <div style={labelStyle}>{t('analysis.primaryLayer')}</div>
      <HTMLSelect
        fill
        value={primaryId ?? ''}
        onChange={(e) => {
          setPrimaryId(e.target.value || undefined)
          setField(undefined)
        }}
        options={layerOptions}
        style={{ marginBottom: 6 }}
      />

      {def.needsSecondary && (
        <>
          <div style={labelStyle}>{t('analysis.secondaryLayer')}</div>
          <HTMLSelect
            fill
            value={secondaryId ?? ''}
            onChange={(e) => setSecondaryId(e.target.value || undefined)}
            options={secondaryLayerOptions}
            style={{ marginBottom: 6 }}
          />
        </>
      )}

      {def.param === 'distance' && (
        <>
          <div style={labelStyle}>{t('analysis.distance')} (米 / m)</div>
          <NumericInput
            fill
            size="small"
            value={distance}
            onValueChange={(v) => setDistance(v || 0)}
            stepSize={100}
            min={1}
            style={{ marginBottom: 6 }}
          />
        </>
      )}

      {def.param === 'tolerance' && (
        <>
          <div style={labelStyle}>{t('analysis.tolerance')} (米 / m)</div>
          <NumericInput
            fill
            size="small"
            value={tolerance}
            onValueChange={(v) => setTolerance(v || 0)}
            min={0}
            stepSize={10}
            style={{ marginBottom: 6 }}
          />
        </>
      )}

      {def.param === 'field' && (
        <>
          <div style={labelStyle}>{t('analysis.dissolveField')}</div>
          <HTMLSelect
            fill
            value={field ?? ''}
            onChange={(e) => setField(e.target.value || undefined)}
            options={fieldOptions}
            style={{ marginBottom: 6 }}
          />
        </>
      )}

      {def.param === 'predicate' && (
        <>
          <div style={labelStyle}>{t('analysis.predicate')}</div>
          <HTMLSelect
            fill
            value={predicate}
            onChange={(e) => setPredicate(e.target.value as AnalysisParams['predicate'])}
            options={(['intersects', 'within', 'contains', 'disjoint'] as const).map((p) => ({
              value: p,
              label: t(`analysis.predicates.${p}`),
            }))}
            style={{ marginBottom: 6 }}
          />
        </>
      )}

      <Divider style={{ margin: '10px 0 8px' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          intent={Intent.PRIMARY}
          size="small"
          loading={running}
          onClick={execute}
          text={t('analysis.run')}
        />
      </div>

      <Alert
        isOpen={warnAlertOpen}
        confirmButtonText="继续执行"
        cancelButtonText="取消"
        intent={Intent.WARNING}
        icon="warning-sign"
        onCancel={() => {
          setWarnAlertOpen(false)
          setPendingExecution(null)
        }}
        onConfirm={() => {
          setWarnAlertOpen(false)
          if (pendingExecution) {
            pendingExecution()
            setPendingExecution(null)
          }
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{t('analysis.largeWarnTitle')}</p>
        <p className={Classes.TEXT_MUTED}>{t('analysis.largeWarn', { count: warnFeatureCount })}</p>
      </Alert>
    </div>
  )
}
