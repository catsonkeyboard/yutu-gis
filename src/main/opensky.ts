/**
 * OpenSky Network + adsb.fi — main process HTTP client
 *
 * Runs in Node.js (no CORS restrictions).
 * The renderer communicates via IPC.
 */

import https from 'https'
import querystring from 'querystring'

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpsRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
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
    if (options.body) req.write(options.body)
    req.end()
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// OpenSky Network
// ═══════════════════════════════════════════════════════════════════════════════

const OPENSKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
const OPENSKY_API_BASE = 'https://opensky-network.org/api'

export interface OpenSkyTokenResult {
  access_token: string
  expires_in: number
}

export async function fetchOpenSkyToken(
  clientId: string,
  clientSecret: string
): Promise<OpenSkyTokenResult> {
  const body = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const resp = await httpsRequest(OPENSKY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (resp.status !== 200) {
    throw new Error(`Token 获取失败 (${resp.status}): ${resp.body}`)
  }

  return JSON.parse(resp.body) as OpenSkyTokenResult
}

export interface OpenSkyBounds {
  lamin: number
  lomin: number
  lamax: number
  lomax: number
}

export async function fetchOpenSkyStates(
  bounds: OpenSkyBounds,
  token: string | null
): Promise<{ time: number; states: unknown[][] | null }> {
  const params = querystring.stringify({
    lamin: bounds.lamin,
    lomin: bounds.lomin,
    lamax: bounds.lamax,
    lomax: bounds.lomax,
    extended: 1,
  })

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const resp = await httpsRequest(`${OPENSKY_API_BASE}/states/all?${params}`, { headers })

  if (resp.status === 401) {
    throw new Error('TOKEN_EXPIRED')
  }
  if (resp.status === 429) {
    throw new Error('API 配额已用尽，请稍后再试')
  }
  if (resp.status !== 200) {
    throw new Error(`OpenSky API 错误 (${resp.status}): ${resp.body}`)
  }

  return JSON.parse(resp.body) as { time: number; states: unknown[][] | null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// adsb.fi Open Data API
// ═══════════════════════════════════════════════════════════════════════════════

const ADSBFI_API_BASE = 'https://opendata.adsb.fi/api'

/**
 * adsb.fi v3 response format (ADSBexchange v2 compatible)
 * GET /v3/lat/{lat}/lon/{lon}/dist/{dist}
 */
export interface AdsbfiResponse {
  ac: AdsbfiAircraft[] | null
  msg: string
  now: number
  total: number
  ctime: number
  ptime: number
}

export interface AdsbfiAircraft {
  hex: string            // ICAO24 hex
  flight?: string        // callsign
  r?: string             // registration
  t?: string             // aircraft type
  alt_baro?: number | 'ground'
  alt_geom?: number
  gs?: number            // ground speed (knots)
  track?: number         // true track
  baro_rate?: number     // vertical rate (ft/min)
  squawk?: string
  lat?: number
  lon?: number
  seen_pos?: number
  seen?: number
  category?: string
  nav_altitude_mcp?: number
}

export async function fetchAdsbfiByLocation(
  lat: number,
  lon: number,
  distNm: number
): Promise<AdsbfiResponse> {
  const url = `${ADSBFI_API_BASE}/v3/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${Math.min(250, Math.round(distNm))}`

  const resp = await httpsRequest(url)

  if (resp.status === 429) {
    throw new Error('adsb.fi 请求频率超限（限制 1 次/秒），请稍后再试')
  }
  if (resp.status !== 200) {
    throw new Error(`adsb.fi API 错误 (${resp.status}): ${resp.body}`)
  }

  return JSON.parse(resp.body) as AdsbfiResponse
}
