import { useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Empty, InputNumber, Radio, Select, Space, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { histogramBins, topCounts } from './chartUtils'
import type { ColumnInfo } from './tableUtils'
import { COLOR_RAMPS } from '../StylePanel/colorRamps'

const { Text } = Typography

type ChartType = 'histogram' | 'bar' | 'pie'

const BAR_COLOR = '#1a6fb5'
const PIE_COLORS = COLOR_RAMPS.Spectral

interface Props {
  features: GeoJSON.Feature[]
  columns: ColumnInfo[]
  height: number
}

function numericValues(features: GeoJSON.Feature[], field: string): number[] {
  const out: number[] = []
  for (const f of features) {
    const v = f.properties?.[field]
    if (v === null || v === undefined || v === '') continue
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toPrecision(4)
}

export default function ChartsTab({ features, columns, height }: Props): ReactElement {
  const { t } = useTranslation()
  const [chartType, setChartType] = useState<ChartType>('histogram')
  const [field, setField] = useState<string | undefined>(undefined)
  const [binCount, setBinCount] = useState(20)
  const containerRef = useRef<HTMLDivElement>(null)

  const numericFields = columns.filter((c) => c.numeric)
  const fieldOptions = (chartType === 'histogram' ? numericFields : columns).map((c) => ({
    value: c.key,
    label: c.key,
  }))
  const effectiveField =
    field && fieldOptions.some((o) => o.value === field) ? field : fieldOptions[0]?.value

  const chartHeight = Math.max(120, height - 110)
  const chartWidth = 760

  const chart = useMemo<ReactElement | null>(() => {
    if (!effectiveField || !features.length) return null

    if (chartType === 'histogram') {
      const values = numericValues(features, effectiveField)
      const bins = histogramBins(values, binCount)
      if (!bins.length) return null
      const maxCount = Math.max(...bins.map((b) => b.count))
      const barW = chartWidth / bins.length
      return (
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
          {bins.map((b, i) => {
            const h = maxCount ? (b.count / maxCount) * (chartHeight - 24) : 0
            return (
              <g key={i}>
                <rect
                  x={i * barW + 1}
                  y={chartHeight - 16 - h}
                  width={Math.max(1, barW - 2)}
                  height={h}
                  fill={BAR_COLOR}
                  opacity={0.85}
                >
                  <title>{`${fmtNum(b.x0)} – ${fmtNum(b.x1)}: ${b.count}`}</title>
                </rect>
              </g>
            )
          })}
          <text x={2} y={chartHeight - 3} fontSize={10} fill="#8f959e">
            {fmtNum(bins[0].x0)}
          </text>
          <text x={chartWidth - 2} y={chartHeight - 3} fontSize={10} fill="#8f959e" textAnchor="end">
            {fmtNum(bins[bins.length - 1].x1)}
          </text>
        </svg>
      )
    }

    const values = features.map((f) => f.properties?.[effectiveField])
    if (chartType === 'bar') {
      const { items, otherCount } = topCounts(values, 20)
      if (!items.length) return null
      const all = otherCount > 0 ? [...items, { label: t('attrTable.chartOther'), count: otherCount }] : items
      const maxCount = Math.max(...all.map((i) => i.count))
      const barW = chartWidth / all.length
      return (
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
          {all.map((item, i) => {
            const h = maxCount ? (item.count / maxCount) * (chartHeight - 40) : 0
            return (
              <g key={i}>
                <rect
                  x={i * barW + 2}
                  y={chartHeight - 28 - h}
                  width={Math.max(1, barW - 4)}
                  height={h}
                  fill={BAR_COLOR}
                  opacity={0.85}
                >
                  <title>{`${item.label}: ${item.count}`}</title>
                </rect>
                <text
                  x={i * barW + barW / 2}
                  y={chartHeight - 14}
                  fontSize={9}
                  fill="#646a73"
                  textAnchor="end"
                  transform={`rotate(-30 ${i * barW + barW / 2} ${chartHeight - 14})`}
                >
                  {item.label.length > 10 ? item.label.slice(0, 10) + '…' : item.label}
                </text>
              </g>
            )
          })}
        </svg>
      )
    }

    // pie
    const { items, otherCount } = topCounts(values, 10)
    if (!items.length) return null
    const all = otherCount > 0 ? [...items, { label: t('attrTable.chartOther'), count: otherCount }] : items
    const total = all.reduce((s, i) => s + i.count, 0)
    const cx = chartHeight / 2
    const cy = chartHeight / 2
    const r = chartHeight / 2 - 10
    let angle = -Math.PI / 2
    const slices = all.map((item, i) => {
      const sweep = (item.count / total) * Math.PI * 2
      const x1 = cx + r * Math.cos(angle)
      const y1 = cy + r * Math.sin(angle)
      angle += sweep
      const x2 = cx + r * Math.cos(angle)
      const y2 = cy + r * Math.sin(angle)
      const large = sweep > Math.PI ? 1 : 0
      const d =
        total === item.count
          ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
      return { d, color: PIE_COLORS[i % PIE_COLORS.length], item }
    })
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <svg width={chartHeight} height={chartHeight}>
          {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth={1}>
              <title>{`${s.item.label}: ${s.item.count} (${((s.item.count / total) * 100).toFixed(1)}%)`}</title>
            </path>
          ))}
        </svg>
        <div style={{ fontSize: 11, maxHeight: chartHeight, overflowY: 'auto' }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0' }}>
              <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ color: '#1f2329' }}>{s.item.label}</span>
              <span style={{ color: '#8f959e' }}>{s.item.count}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }, [effectiveField, features, chartType, binCount, chartHeight, t])

  return (
    <div ref={containerRef} style={{ padding: '4px 12px', height: '100%', overflow: 'auto' }}>
      <Space size={8} wrap style={{ marginBottom: 6 }}>
        <Radio.Group
          size="small"
          optionType="button"
          value={chartType}
          onChange={(e) => setChartType(e.target.value)}
          options={[
            { value: 'histogram', label: t('attrTable.chartHistogram') },
            { value: 'bar', label: t('attrTable.chartBar') },
            { value: 'pie', label: t('attrTable.chartPie') },
          ]}
        />
        <Select
          size="small"
          style={{ width: 160 }}
          value={effectiveField}
          onChange={setField}
          options={fieldOptions}
          placeholder={t('attrTable.field')}
          showSearch
        />
        {chartType === 'histogram' && (
          <span style={{ fontSize: 12 }}>
            {t('attrTable.chartBins')}{' '}
            <InputNumber
              size="small"
              min={5}
              max={50}
              value={binCount}
              onChange={(v) => setBinCount(v ?? 20)}
              style={{ width: 60 }}
            />
          </span>
        )}
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('attrTable.chartSamples', { count: features.length })}
        </Text>
      </Space>
      {chart ?? (
        <Empty description={t('attrTable.chartNoData')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  )
}
