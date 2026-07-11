import { useMemo } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  ColorPicker,
  Divider,
  InputNumber,
  Radio,
  Select,
  Slider,
  Space,
  Typography,
  message,
} from 'antd'
import { BgColorsOutlined, CloseOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useLayerStore, type LayerStyle } from '../../stores/layerStore'
import { useStylePanelStore } from '../../stores/stylePanelStore'
import { deriveColumns } from '../AttributeTable/tableUtils'
import { COLOR_RAMPS, RAMP_NAMES, sampleRamp } from './colorRamps'
import { DEFAULT_STYLE, computeBreaks, scanNumericValues, scanUniqueValues } from './styleUtils'

const { Text } = Typography

const CATEGORY_CAP = 30

export default function StylePanel(): ReactElement | null {
  const { t } = useTranslation()
  const { open, layerId, close } = useStylePanelStore()
  const layers = useLayerStore((s) => s.layers)
  const setStyle = useLayerStore((s) => s.setStyle)
  const setOpacity = useLayerStore((s) => s.setOpacity)

  const layer = layers.find((l) => l.id === layerId)
  const fc = layer?.type === 'geojson' ? (layer.source as GeoJSON.FeatureCollection) : null

  const style: LayerStyle = layer?.style ?? DEFAULT_STYLE

  const { columns } = useMemo(
    () => deriveColumns(fc?.features ?? []),
    [fc]
  )
  const numericFields = columns.filter((c) => c.numeric).map((c) => ({ value: c.key, label: c.key }))
  const allFields = columns.map((c) => ({ value: c.key, label: c.key }))

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

  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#646a73', margin: '6px 0 4px' }
  const gradClasses = (style.breaks?.length ?? 5) || 5
  const gradMethodDefault: 'equal' | 'quantile' = 'equal'
  const ramp = style.rampName ?? 'Blues'

  const rampOptions = RAMP_NAMES.map((name) => ({
    value: name,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 72,
            height: 10,
            borderRadius: 2,
            background: `linear-gradient(to right, ${COLOR_RAMPS[name].join(',')})`,
          }}
        />
        <span style={{ fontSize: 12 }}>{name}</span>
      </div>
    ),
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
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 620,
        padding: '10px 14px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <Text strong style={{ flex: 1, fontSize: 13 }} ellipsis>
          <BgColorsOutlined style={{ marginRight: 6 }} />
          {t('style.title')} — {layer.name}
        </Text>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={close} />
      </div>

      <Radio.Group
        size="small"
        value={style.mode}
        onChange={(e) => update({ mode: e.target.value })}
        optionType="button"
        buttonStyle="solid"
        style={{ marginBottom: 4 }}
        options={[
          { value: 'single', label: t('style.modeSingle') },
          { value: 'categorized', label: t('style.modeCategorized') },
          { value: 'graduated', label: t('style.modeGraduated') },
          { value: 'cluster', label: t('style.modeCluster') },
          { value: 'heatmap', label: t('style.modeHeatmap') },
        ]}
      />
      {(style.mode === 'cluster' || style.mode === 'heatmap') && (
        <div style={{ fontSize: 11, color: '#8f959e', marginTop: 2 }}>
          {t('style.pointsOnlyHint')}
        </div>
      )}

      {/* Base symbol */}
      <div style={labelStyle}>{t('style.baseSymbol')}</div>
      <Space wrap size={8}>
        {style.mode === 'single' && (
          <span style={{ fontSize: 12 }}>
            {t('style.fillColor')}{' '}
            <ColorPicker
              size="small"
              value={style.fillColor}
              onChange={(c) => update({ fillColor: c.toHexString() })}
            />
          </span>
        )}
        {style.mode === 'single' && (
          <span style={{ fontSize: 12 }}>
            {t('style.strokeColor')}{' '}
            <ColorPicker
              size="small"
              value={style.strokeColor}
              onChange={(c) => update({ strokeColor: c.toHexString() })}
            />
          </span>
        )}
        <span style={{ fontSize: 12 }}>
          {t('style.strokeWidth')}{' '}
          <InputNumber
            size="small"
            min={0}
            max={10}
            step={0.5}
            value={style.strokeWidth}
            onChange={(v) => update({ strokeWidth: v ?? 1.5 })}
            style={{ width: 64 }}
          />
        </span>
        <span style={{ fontSize: 12 }}>
          {t('style.pointRadius')}{' '}
          <InputNumber
            size="small"
            min={1}
            max={30}
            value={style.pointRadius}
            onChange={(v) => update({ pointRadius: v ?? 5 })}
            style={{ width: 64 }}
          />
        </span>
      </Space>

      <div style={labelStyle}>{t('style.fillOpacity')}</div>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={style.fillOpacity}
        onChange={(v) => update({ fillOpacity: v })}
      />

      <div style={labelStyle}>{t('style.layerOpacity')}</div>
      <Slider
        min={0}
        max={1}
        step={0.05}
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
            step={5}
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
            step={1}
            value={style.heatRadius ?? 20}
            onChange={(v) => update({ heatRadius: v })}
          />
        </>
      )}

      {/* Categorized */}
      {style.mode === 'categorized' && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div style={labelStyle}>{t('style.field')}</div>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              size="small"
              style={{ flex: 1 }}
              value={style.field}
              onChange={(field) => generateCategories(field, ramp)}
              options={allFields}
              placeholder={t('style.selectField')}
              showSearch
            />
            <Select
              size="small"
              style={{ width: 110 }}
              value={ramp}
              onChange={(name) => {
                if (style.field) generateCategories(style.field, name)
                else update({ rampName: name })
              }}
              options={rampOptions}
            />
          </Space.Compact>
          <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
            {(style.categories ?? []).map((c, i) => (
              <div key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                <ColorPicker
                  size="small"
                  value={c.color}
                  onChange={(color) => {
                    const categories = [...(style.categories ?? [])]
                    categories[i] = { ...categories[i], color: color.toHexString() }
                    update({ categories })
                  }}
                />
                <Text style={{ fontSize: 12 }} ellipsis>
                  {c.value}
                </Text>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Graduated */}
      {style.mode === 'graduated' && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div style={labelStyle}>{t('style.field')}</div>
          <Select
            size="small"
            style={{ width: '100%' }}
            value={style.field}
            onChange={(field) => generateBreaks(field, gradClasses, gradMethodDefault, ramp)}
            options={numericFields}
            placeholder={t('style.selectNumericField')}
            showSearch
          />
          <Space style={{ marginTop: 6 }} size={8}>
            <span style={{ fontSize: 12 }}>
              {t('style.classes')}{' '}
              <InputNumber
                size="small"
                min={3}
                max={9}
                value={gradClasses}
                onChange={(v) => {
                  if (style.field) generateBreaks(style.field, v ?? 5, gradMethodDefault, ramp)
                }}
                style={{ width: 56 }}
              />
            </span>
            <Button
              size="small"
              onClick={() => style.field && generateBreaks(style.field, gradClasses, 'equal', ramp)}
            >
              {t('style.equal')}
            </Button>
            <Button
              size="small"
              onClick={() => style.field && generateBreaks(style.field, gradClasses, 'quantile', ramp)}
            >
              {t('style.quantile')}
            </Button>
          </Space>
          <div style={{ marginTop: 6 }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={ramp}
              onChange={(name) => {
                if (style.field) generateBreaks(style.field, gradClasses, gradMethodDefault, name)
                else update({ rampName: name })
              }}
              options={rampOptions}
            />
          </div>
          <div style={{ marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
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
                  <ColorPicker
                    size="small"
                    value={b.color}
                    onChange={(color) => {
                      const breaks = [...(style.breaks ?? [])]
                      breaks[i] = { ...breaks[i], color: color.toHexString() }
                      update({ breaks })
                    }}
                  />
                  <Text style={{ fontSize: 12 }}>{label}</Text>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Labels — independent of the symbology mode */}
      <Divider style={{ margin: '8px 0' }} />
      <div style={labelStyle}>{t('style.labelSection')}</div>
      <Space size={8} wrap>
        <Select
          size="small"
          style={{ width: 140 }}
          value={style.labelField}
          onChange={(v) => update({ labelField: v })}
          options={allFields}
          placeholder={t('style.labelField')}
          allowClear
          showSearch
        />
        {style.labelField && (
          <>
            <span style={{ fontSize: 12 }}>
              {t('style.labelSize')}{' '}
              <InputNumber
                size="small"
                min={8}
                max={32}
                value={style.labelSize ?? 12}
                onChange={(v) => update({ labelSize: v ?? 12 })}
                style={{ width: 56 }}
              />
            </span>
            <ColorPicker
              size="small"
              value={style.labelColor ?? '#333333'}
              onChange={(c) => update({ labelColor: c.toHexString() })}
            />
          </>
        )}
      </Space>

      <Divider style={{ margin: '8px 0' }} />
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setStyle(layer.id, undefined)}>
          {t('style.reset')}
        </Button>
      </Space>
    </div>
  )
}
