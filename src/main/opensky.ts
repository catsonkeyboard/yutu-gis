/**
 * OpenSky Network API — main process HTTP client
 *
 * Runs in Node.js (no CORS restrictions).
 * The renderer communicates via IPC.
 */

import https from 'https'
import querystring from 'querystring'

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
const API_BASE = 'https://opensky-network.org/api'

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

// ── Public API ───────────────────────────────────────────────────────────────

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

  const resp = await httpsRequest(TOKEN_URL, {
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

  const resp = await httpsRequest(`${API_BASE}/states/all?${params}`, { headers })

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
