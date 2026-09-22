import { useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Classes,
  HTMLSelect,
  NonIdealState,
  NumericInput,
  SegmentedControl,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { histogramBins, topCounts } from './chartUtils'
import type { ColumnInfo } from './tableUtils'
import { COLOR_RAMPS } from '../StylePanel/colorRamps'

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
          <text x={4} y={chartHeight - 4} fontSize={10} fill="#8f959e">
            {fmtNum(bins[0].x0)}
          </text>
          <text x={chartWidth - 4} y={chartHeight - 4} fontSize={10} textAnchor="end" fill="#8f959e">
            {fmtNum(bins[bins.length - 1].x1)}
          </text>
        </svg>
      )
    }

    if (chartType === 'bar') {
      const vals = features.map((f) => f.properties?.[effectiveField])
      const { items } = topCounts(vals, 12)
      if (!items.length) return null
      const max = Math.max(...items.map((c) => c.count))
      const rowH = Math.min(22, (chartHeight - 8) / items.length)
      return (
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {items.map((c, i) => {
            const barW = max ? (c.count / max) * (chartWidth - 220) : 0
            const y = i * rowH + 4
            return (
              <g key={c.label}>
                <text x={110} y={y + rowH - 6} fontSize={11} textAnchor="end" fill="#1f2329">
                  {c.label.slice(0, 14)}
                </text>
                <rect x={120} y={y + 2} width={barW} height={rowH - 4} fill={BAR_COLOR} opacity={0.85}>
                  <title>{`${c.label}: ${c.count}`}</title>
                </rect>
                <text x={126 + barW} y={y + rowH - 6} fontSize={10} fill="#8f959e">
                  {c.count}
                </text>
              </g>
            )
          })}
        </svg>
      )
    }

    // Pie chart (top 7 + "其他")
    const vals = features.map((f) => f.properties?.[effectiveField])
    const { items, otherCount } = topCounts(vals, 7)
    const allItems = otherCount > 0 ? [...items, { label: '其他', count: otherCount }] : items
    if (!allItems.length) return null
    const total = allItems.reduce((s, c) => s + c.count, 0)
    if (!total) return null

    const cx = chartWidth / 3
    const cy = chartHeight / 2
    const r = Math.min(chartHeight / 2 - 12, 100)

    let currentAngle = -Math.PI / 2
    const slices = allItems.map((c, i) => {
      const angle = (c.count / total) * Math.PI * 2
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle

      const x1 = cx + r * Math.cos(startAngle)
      const y1 = cy + r * Math.sin(startAngle)
      const x2 = cx + r * Math.cos(endAngle)
      const y2 = cy + r * Math.sin(endAngle)
      const largeArc = angle > Math.PI ? 1 : 0
      const pathData =
        allItems.length === 1
          ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

      const color = PIE_COLORS[i % PIE_COLORS.length]
      return { ...c, pathData, color, percent: ((c.count / total) * 100).toFixed(1) }
    })

    return (
      <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {slices.map((s) => (
          <path key={s.label} d={s.pathData} fill={s.color} opacity={0.88}>
            <title>{`${s.label}: ${s.count} (${s.percent}%)`}</title>
          </path>
        ))}
        {slices.map((s, i) => {
          const ly = 24 + i * 18
          const lx = cx + r + 40
          return (
            <g key={s.label}>
              <rect x={lx} y={ly - 9} width={10} height={10} fill={s.color} />
              <text x={lx + 16} y={ly} fontSize={11} fill="#1f2329">
                {s.label.slice(0, 16)} — {s.count} ({s.percent}%)
              </text>
            </g>
          )
        })}
      </svg>
    )
  }, [effectiveField, features, chartType, binCount, chartHeight, chartWidth])

  return (
    <div ref={containerRef} style={{ padding: '6px 12px', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <SegmentedControl
          small
          value={chartType}
          onValueChange={(val) => setChartType(val as ChartType)}
          options={[
            { value: 'histogram', label: t('attrTable.chartHistogram') },
            { value: 'bar', label: t('attrTable.chartBar') },
            { value: 'pie', label: t('attrTable.chartPie') },
          ]}
        />
        <HTMLSelect
          style={{ width: 160 }}
          value={effectiveField ?? ''}
          onChange={(e) => setField(e.target.value || undefined)}
          options={fieldOptions}
        />
        {chartType === 'histogram' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span>{t('attrTable.chartBins')}</span>
            <NumericInput
              size="small"
              min={5}
              max={50}
              value={binCount}
              onValueChange={(v) => setBinCount(v || 20)}
              style={{ width: 56 }}
            />
          </div>
        )}
        <span className={Classes.TEXT_MUTED} style={{ fontSize: 11 }}>
          {t('attrTable.chartSamples', { count: features.length })}
        </span>
      </div>
      {chart ?? (
        <div style={{ padding: '24px 0' }}>
          <NonIdealState
            icon="chart"
            title={t('attrTable.chartNoData')}
          />
        </div>
      )}
    </div>
  )
}
