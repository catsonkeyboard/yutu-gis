/** Hardcoded 9-step color ramps (no runtime dependency). */
export const COLOR_RAMPS: Record<string, string[]> = {
  Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
  Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
  Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
  Viridis: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'],
  Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
  GnYlRd: ['#006837', '#1a9850', '#66bd63', '#a6d96a', '#fee08b', '#fdae61', '#f46d43', '#d73027', '#a50026'],
}

export const RAMP_NAMES = Object.keys(COLOR_RAMPS)

/**
 * Sample n colors from a ramp: evenly spaced when n ≤ ramp length,
 * cycling through the ramp otherwise (categorized mode with many classes).
 */
export function sampleRamp(name: string, n: number): string[] {
  const ramp = COLOR_RAMPS[name] ?? COLOR_RAMPS.Blues
  if (n <= 0) return []
  if (n === 1) return [ramp[Math.floor(ramp.length / 2)]]
  if (n <= ramp.length) {
    return Array.from({ length: n }, (_, i) => ramp[Math.round((i * (ramp.length - 1)) / (n - 1))])
  }
  return Array.from({ length: n }, (_, i) => ramp[i % ramp.length])
}
