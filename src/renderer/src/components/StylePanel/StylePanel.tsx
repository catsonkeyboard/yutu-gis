import { useMemo } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  ButtonGroup,
  Classes,
  ControlGroup,
  Divider,
  HTMLSelect,
  Icon,
  NumericInput,
  SegmentedControl,
  Slider,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useLayerStore, type LayerStyle } from '../../stores/layerStore'
import { useStylePanelStore } from '../../stores/stylePanelStore'
import { deriveColumns } from '../AttributeTable/tableUtils'
import { RAMP_NAMES, sampleRamp } from './colorRamps'
import { DEFAULT_STYLE, computeBreaks, scanNumericValues, scanUniqueValues } from './styleUtils'
import { message } from '../../utils/toaster'

const CATEGORY_CAP = 30

function ColorSwatch({
  value,
  onChange,
}: {
  value?: string
  onChange: (val: string) => void
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 22,
        height: 22,
        borderRadius: 3,
        border: '1px solid var(--color-border, #d9dce0)',
        backgroundColor: value || '#1a6fb5',
        cursor: 'pointer',
        overflow: 'hidden',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      <input
        type="color"
        value={value || '#1a6fb5'}
        onChange={(e) => onChange(e.target.value)}
        style={{
          opacity: 0,
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: 'pointer',
        }}
      />
    </span>
  )
}

export default function StylePanel(): ReactElement | null {
  const { t } = useTranslation()
  const { open, layerId, close } = useStylePanelStore()
  const layers = useLayerStore((s) => s.layers)
  const setStyle = useLayerStore((s) => s.setStyle)
  const setOpacity = useLayerStore((s) => s.setOpacity)

  const layer = layers.find((l) => l.id === layerId)
  const fc = layer?.type === 'geojson' ? (layer.source as GeoJSON.FeatureCollection) : null

  const style: LayerStyle = layer?.style ?? DEFAULT_STYLE

  const { columns } = useMemo(() => deriveColumns(fc?.features ?? []), [fc])
  const numericFields = [
    { value: '', label: t('style.selectNumericField') },
    ...columns.filter((c) => c.numeric).map((c) => ({ value: c.key, label: c.key })),
  ]
  const allFields = [
    { value: '', label: t('style.selectField') },
    ...columns.map((c) => ({ value: c.key, label: c.key })),
  ]

  if (!open || !layer || !fc) return null

  const update = (patch: Partial<LayerStyle>) => {
    setStyle(layer.id, { ...style, ...patch })
  }

  const generateCategories = (field: string, rampName: string) => {
    const { values, truncated } = scanUniqueValues(fc, field, CATEGORY_CAP)
    if (!values.length) {
      message.warning(t('style.noValues'))
      return
    }
    if (truncated) message.warning(t('style.tooManyCategories', { cap: CATEGORY_CAP }))
    const colors = sampleRamp(rampName, values.length)
    update({
      field,
      rampName,
      categories: values.map((value, i) => ({ value, color: colors[i] })),
    })
  }

  const generateBreaks = (
    field: string,
    classes: number,
    method: 'equal' | 'quantile',
    rampName: string
  ) => {
    const values = scanNumericValues(fc, field)
    if (values.length < 2) {
      message.warning(t('style.noValues'))
      return
    }
    const thresholds = computeBreaks(values, classes, method)
    const colors = sampleRamp(rampName, thresholds.length + 1)
    update({
      field,
      rampName,
      breaks: [
        ...thresholds.map((max, i) => ({ max, color: colors[i] })),
        { max: null, color: colors[thresholds.length] },
      ],
    })
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#646a73',
    margin: '6px 0 4px',
  }
  const gradClasses = (style.breaks?.length ?? 5) || 5
  const gradMethodDefault: 'equal' | 'quantile' = 'equal'
  const ramp = style.rampName ?? 'Blues'

  const rampOptions = RAMP_NAMES.map((name) => ({
    value: name,
    label: name,
  }))

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
        zIndex: 620,
        padding: '10px 14px 14px',
        border: '1px solid var(--color-border, #d9dce0)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Icon icon="tint" size={14} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('style.title')} — {layer.name}
          </span>
        </div>
        <Button size="small" variant="minimal" icon="cross" onClick={close} />
      </div>

      <SegmentedControl
        small
        fill
        options={[
          { value: 'single', label: t('style.modeSingle') },
          { value: 'categorized', label: t('style.modeCategorized') },
          { value: 'graduated', label: t('style.modeGraduated') },
          { value: 'cluster', label: t('style.modeCluster') },
          { value: 'heatmap', label: t('style.modeHeatmap') },
        ]}
        value={style.mode}
        onValueChange={(val) => update({ mode: val as LayerStyle['mode'] })}
      />

      {(style.mode === 'cluster' || style.mode === 'heatmap') && (
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, marginTop: 4 }}>
          {t('style.pointsOnlyHint')}
        </div>
      )}

      {/* Base symbol */}
      <div style={labelStyle}>{t('style.baseSymbol')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {style.mode === 'single' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{t('style.fillColor')}</span>
            <ColorSwatch
              value={style.fillColor}
              onChange={(c) => update({ fillColor: c })}
            />
          </div>
        )}
        {style.mode === 'single' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{t('style.strokeColor')}</span>
            <ColorSwatch
              value={style.strokeColor}
              onChange={(c) => update({ strokeColor: c })}
            />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{t('style.strokeWidth')}</span>
          <NumericInput
            size="small"
            min={0}
            max={10}
            stepSize={0.5}
            value={style.strokeWidth}
            onValueChange={(v) => update({ strokeWidth: v || 1.5 })}
            style={{ width: 56 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{t('style.pointRadius')}</span>
          <NumericInput
            size="small"
            min={1}
            max={30}
            stepSize={1}
            value={style.pointRadius}
            onValueChange={(v) => update({ pointRadius: v || 5 })}
            style={{ width: 56 }}
          />
        </div>
      </div>

      <div style={labelStyle}>{t('style.fillOpacity')} ({(style.fillOpacity * 100).toFixed(0)}%)</div>
      <Slider
        min={0}
        max={1}
        stepSize={0.05}
        labelStepSize={0.25}
        value={style.fillOpacity}
        onChange={(v) => update({ fillOpacity: v })}
      />

      <div style={labelStyle}>{t('style.layerOpacity')} ({(layer.opacity * 100).toFixed(0)}%)</div>
      <Slider
        min={0}
        max={1}
        stepSize={0.05}
        labelStepSize={0.25}
        value={layer.opacity}
        onChange={(v) => setOpacity(layer.id, v)}
      />

      {/* Cluster / heatmap parameters */}
      {style.mode === 'cluster' && (
        <>
          <div style={labelStyle}>{t('style.clusterRadius')}</div>
          <Slider
            min={20}
            max={120}
            stepSize={5}
            value={style.clusterRadius ?? 50}
            onChange={(v) => update({ clusterRadius: v })}
          />
        </>
      )}
      {style.mode === 'heatmap' && (
        <>
          <div style={labelStyle}>{t('style.heatRadius')}</div>
          <Slider
            min={5}
            max={60}
            stepSize={1}
            value={style.heatRadius ?? 20}
            onChange={(v) => update({ heatRadius: v })}
          />
        </>
      )}

      {/* Categorized */}
      {style.mode === 'categorized' && (
        <>
          <Divider style={{ margin: '10px 0 6px' }} />
          <div style={labelStyle}>{t('style.field')}</div>
          <ControlGroup fill style={{ marginBottom: 6 }}>
            <HTMLSelect
              value={style.field ?? ''}
              onChange={(e) => generateCategories(e.target.value, ramp)}
              options={allFields}
            />
            <HTMLSelect
              style={{ width: 100 }}
              value={ramp}
              onChange={(e) => {
                const name = e.target.value
                if (style.field) generateCategories(style.field, name)
                else update({ rampName: name })
              }}
              options={rampOptions}
            />
          </ControlGroup>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(style.categories ?? []).map((c, i) => (
              <div key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <ColorSwatch
                  value={c.color}
                  onChange={(color) => {
                    const categories = [...(style.categories ?? [])]
                    categories[i] = { ...categories[i], color }
                    update({ categories })
                  }}
                />
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Graduated */}
      {style.mode === 'graduated' && (
        <>
          <Divider style={{ margin: '10px 0 6px' }} />
          <div style={labelStyle}>{t('style.field')}</div>
          <HTMLSelect
            fill
            value={style.field ?? ''}
            onChange={(e) => generateBreaks(e.target.value, gradClasses, gradMethodDefault, ramp)}
            options={numericFields}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 12 }}>{t('style.classes')}</span>
            <NumericInput
              size="small"
              min={3}
              max={9}
              stepSize={1}
              value={gradClasses}
              onValueChange={(v) => {
                if (style.field) generateBreaks(style.field, v || 5, gradMethodDefault, ramp)
              }}
              style={{ width: 50 }}
            />
            <ButtonGroup variant="minimal" size="small">
              <Button
                text={t('style.equal')}
                onClick={() => style.field && generateBreaks(style.field, gradClasses, 'equal', ramp)}
              />
              <Button
                text={t('style.quantile')}
                onClick={() => style.field && generateBreaks(style.field, gradClasses, 'quantile', ramp)}
              />
            </ButtonGroup>
          </div>
          <div style={{ marginTop: 6 }}>
            <HTMLSelect
              fill
              value={ramp}
              onChange={(e) => {
                const name = e.target.value
                if (style.field) generateBreaks(style.field, gradClasses, gradMethodDefault, name)
                else update({ rampName: name })
              }}
              options={rampOptions}
            />
          </div>
          <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(style.breaks ?? []).map((b, i) => {
              const prev = i === 0 ? null : style.breaks![i - 1].max
              const label =
                b.max === null
                  ? `> ${prev ?? ''}`
                  : prev === null
                    ? `≤ ${Number(b.max.toFixed(4))}`
                    : `${Number(prev!.toFixed(4))} – ${Number(b.max.toFixed(4))}`
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <ColorSwatch
                    value={b.color}
                    onChange={(color) => {
                      const breaks = [...(style.breaks ?? [])]
                      breaks[i] = { ...breaks[i], color }
                      update({ breaks })
                    }}
                  />
                  <span style={{ fontSize: 12 }}>{label}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Labels — independent of the symbology mode */}
      <Divider style={{ margin: '10px 0 6px' }} />
      <div style={labelStyle}>{t('style.labelSection')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <HTMLSelect
          style={{ width: 140 }}
          value={style.labelField ?? ''}
          onChange={(e) => update({ labelField: e.target.value || undefined })}
          options={allFields}
        />
        {style.labelField && (
          <>
            <span style={{ fontSize: 12 }}>{t('style.labelSize')}</span>
            <NumericInput
              size="small"
              min={8}
              max={32}
              value={style.labelSize ?? 12}
              onValueChange={(v) => update({ labelSize: v || 12 })}
              style={{ width: 50 }}
            />
            <ColorSwatch
              value={style.labelColor ?? '#333333'}
              onChange={(c) => update({ labelColor: c })}
            />
          </>
        )}
      </div>

      <Divider style={{ margin: '10px 0 8px' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" variant="minimal" onClick={() => setStyle(layer.id, undefined)}>
          {t('style.reset')}
        </Button>
      </div>
    </div>
  )
}
