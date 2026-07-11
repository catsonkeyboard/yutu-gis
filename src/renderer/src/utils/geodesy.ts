/** Geodesic helpers for the measure tool (WGS-84 spherical approximations). */

const R = 6371008.8 // mean Earth radius in meters

const rad = (d: number): number => (d * Math.PI) / 180

/** Great-circle distance between two [lng, lat] points, in meters. */
export function haversineDistance(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Total length of a polyline, in meters. */
export function pathLength(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i])
  }
  return total
}

/**
 * Spherical polygon area of a ring of [lng, lat] coordinates, in m².
 * Uses the spherical excess formula (same approach as turf.js / Karney).
 */
export function sphericalArea(ring: [number, number][]): number {
  // Drop duplicated closing point if present
  let pts = ring
  if (
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts = pts.slice(0, -1)
  }
  if (pts.length < 3) return 0
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i]
    const p2 = pts[(i + 1) % pts.length]
    total += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])))
  }
  return Math.abs((total * R * R) / 2)
}

/** "532 m" below 1 km, "1.53 km" above. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

/** "5000 m²" below 1 ha, "5.00 ha" below 1 km², "2.50 km²" above. */
export function formatArea(m2: number): string {
  if (m2 < 10000) return `${Math.round(m2)} m²`
  if (m2 < 1000000) return `${(m2 / 10000).toFixed(2)} ha`
  return `${(m2 / 1000000).toFixed(2)} km²`
}
