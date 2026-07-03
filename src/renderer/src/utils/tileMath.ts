/**
 * Tile math for download size estimation.
 * Mirrors python/services/tiles.py — keep the two in sync.
 */

const MAX_LAT = 85.05112878

export function deg2num(lat: number, lon: number, zoom: number): [number, number] {
  const clamped = Math.max(Math.min(lat, MAX_LAT), -MAX_LAT)
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (clamped * Math.PI) / 180
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n)
  return [Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1)]
}

export function countTiles(
  south: number,
  west: number,
  north: number,
  east: number,
  minZoom: number,
  maxZoom: number
): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const [xMin, yMin] = deg2num(north, west, z)
    const [xMax, yMax] = deg2num(south, east, z)
    total += (xMax - xMin + 1) * (yMax - yMin + 1)
  }
  return total
}
