export interface HistogramBin {
  x0: number
  x1: number
  count: number
}

/** Equal-width histogram bins; all-equal values collapse into one bucket. */
export function histogramBins(values: number[], n: number): HistogramBin[] {
  if (!values.length || n < 1) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    return [{ x0: min, x1: max, count: values.length }]
  }
  const width = (max - min) / n
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(n - 1, Math.floor((v - min) / width))
    bins[idx].count++
  }
  return bins
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** Top-n value frequencies (desc); everything else aggregated into otherCount. */
export function topCounts(
  values: unknown[],
  n: number
): { items: { label: string; count: number }[]; otherCount: number } {
  const counts = new Map<string, number>()
  for (const v of values) {
    if (isEmptyValue(v)) continue
    const s = String(v)
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const items = sorted.slice(0, n).map(([label, count]) => ({ label, count }))
  const otherCount = sorted.slice(n).reduce((s, [, c]) => s + c, 0)
  return { items, otherCount }
}
