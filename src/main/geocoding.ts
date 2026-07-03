/**
 * Geocoding service — main process HTTP client
 *
 * Primary: OpenStreetMap Nominatim (https://nominatim.org/release-docs/develop/api/Search/)
 * Fallback: Photon by komoot (https://photon.komoot.io) — also OSM-based, used
 * when Nominatim times out or errors (the public Nominatim server is
 * rate-limited and often slow).
 *
 * Runs in Node.js to avoid CORS restrictions.
 */

import https from 'https'

const REQUEST_TIMEOUT_MS = 10_000

function httpsGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: REQUEST_TIMEOUT_MS,
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
    req.on('timeout', () => {
      req.destroy(new Error(`请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）：${parsed.hostname}`))
    })
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

async function searchNominatim(query: string, limit: number): Promise<GeocodingResult[]> {
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

async function searchPhoton(query: string, limit: number): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  })

  const url = `https://photon.komoot.io/api/?${params.toString()}`
  const resp = await httpsGet(url)

  if (resp.status !== 200) {
    throw new Error(`Photon 查询失败 (${resp.status}): ${resp.body}`)
  }

  const data = JSON.parse(resp.body) as {
    features: Array<{
      geometry: { coordinates: [number, number] } // [lon, lat]
      properties: {
        name?: string
        city?: string
        state?: string
        country?: string
        osm_value?: string
        extent?: [number, number, number, number] // [west, north, east, south]
      }
    }>
  }

  return data.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates
    const p = f.properties
    const name = p.name || query
    const displayName = [p.name, p.city, p.state, p.country].filter(Boolean).join(', ')
    // Photon extent is [west, north, east, south]; convert to Nominatim order
    // [south, north, west, east]. POIs without extent get a small padded box.
    const pad = 0.02
    const bbox: [number, number, number, number] = p.extent
      ? [p.extent[3], p.extent[1], p.extent[0], p.extent[2]]
      : [lat - pad, lat + pad, lon - pad, lon + pad]
    return {
      name,
      displayName: displayName || name,
      lat,
      lon,
      bbox,
      type: p.osm_value ?? 'place',
      importance: 0,
    }
  })
}

/**
 * Search for a place by name. Tries Nominatim first; on timeout or error
 * falls back to Photon.
 */
export async function geocodeSearch(
  query: string,
  limit: number = 5
): Promise<GeocodingResult[]> {
  let nominatimError: Error
  try {
    return await searchNominatim(query, limit)
  } catch (e) {
    nominatimError = e instanceof Error ? e : new Error(String(e))
  }

  try {
    return await searchPhoton(query, limit)
  } catch (e) {
    const photonError = e instanceof Error ? e : new Error(String(e))
    throw new Error(
      `地名搜索失败 — Nominatim: ${nominatimError.message}；Photon: ${photonError.message}`
    )
  }
}
