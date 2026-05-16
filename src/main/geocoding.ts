/**
 * Geocoding service — main process HTTP client
 *
 * Uses OpenStreetMap Nominatim for city/place name geocoding.
 * https://nominatim.org/release-docs/develop/api/Search/
 *
 * Runs in Node.js to avoid CORS restrictions.
 */

import https from 'https'

function httpsGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'YutuGIS/1.0 (https://github.com/yutu-gis)',
          'Accept': 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface GeocodingResult {
  name: string
  displayName: string
  lat: number
  lon: number
  bbox: [number, number, number, number] // [south, north, west, east] from Nominatim
  type: string
  importance: number
}

/**
 * Search for a place by name using Nominatim.
 * Returns up to `limit` results.
 */
export async function geocodeSearch(
  query: string,
  limit: number = 5
): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(limit),
    addressdetails: '0',
  })

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`
  const resp = await httpsGet(url)

  if (resp.status !== 200) {
    throw new Error(`Nominatim 查询失败 (${resp.status}): ${resp.body}`)
  }

  const data = JSON.parse(resp.body) as Array<{
    place_id: number
    display_name: string
    name: string
    lat: string
    lon: string
    boundingbox: [string, string, string, string] // [south, north, west, east]
    type: string
    importance: number
  }>

  return data.map((item) => ({
    name: item.name || item.display_name.split(',')[0],
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    bbox: [
      parseFloat(item.boundingbox[0]),
      parseFloat(item.boundingbox[1]),
      parseFloat(item.boundingbox[2]),
      parseFloat(item.boundingbox[3]),
    ] as [number, number, number, number],
    type: item.type,
    importance: item.importance,
  }))
}
