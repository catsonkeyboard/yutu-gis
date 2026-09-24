/**
 * OpenSky Network API client (renderer side)
 *
 * All requests go to the local Python backend (`/external/*`), which proxies
 * OpenSky with system-proxy support. Access tokens are cached SERVER-side —
 * the renderer no longer tracks token expiry.
 *
 * State vector indices:
 *  0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact,
 *  5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity,
 * 10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude, 14: squawk,
 * 15: spi, 16: position_source, 17: category
 */

import { getJson, getBaseUrl, parseApiError } from './api'
import type { FlightState } from '../stores/flightStore'

/**
 * Exchange client_id + client_secret for an access token (cached server-side).
 * Returns { access_token, expires_in }.
 */
export async function fetchAccessToken(
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const body = JSON.stringify({ client_id: clientId, client_secret: clientSecret })
  const resp = await fetch(`${getBaseUrl()}/external/opensky/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
  if (!resp.ok) throw new Error(parseApiError(await resp.text()))
  return resp.json() as Promise<{ access_token: string; expires_in: number }>
}

/**
 * Fetch state vectors for a bounding box via the Python backend.
 * Credentials are optional — the backend attaches a cached token when supplied.
 */
export async function fetchStateVectors(
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number },
  credentials: { clientId: string; clientSecret: string } | null
): Promise<Record<string, FlightState>> {
  const params = new URLSearchParams({
    lamin: String(bounds.lamin),
    lomin: String(bounds.lomin),
    lamax: String(bounds.lamax),
    lomax: String(bounds.lomax),
    ...(credentials
      ? { client_id: credentials.clientId, client_secret: credentials.clientSecret }
      : {})
  })
  const data = await getJson<{ time: number; states: unknown[][] | null }>(
    `/external/opensky/states?${params}`
  )

  const flights: Record<string, FlightState> = {}

  if (!data.states) return flights

  for (const sv of data.states) {
    const icao24 = sv[0] as string
    const lat = sv[6] as number | null
    const lon = sv[5] as number | null

    // Skip entries without position data
    if (lat == null || lon == null) continue

    flights[icao24] = {
      icao24,
      callsign: (sv[1] as string | null)?.trim() || null,
      originCountry: sv[2] as string,
      longitude: lon,
      latitude: lat,
      baroAltitude: sv[7] as number | null,
      onGround: sv[8] as boolean,
      velocity: sv[9] as number | null,
      trueTrack: sv[10] as number | null,
      verticalRate: sv[11] as number | null,
      geoAltitude: sv[13] as number | null,
      squawk: sv[14] as string | null,
      category: (sv[17] as number) ?? 0
    }
  }

  return flights
}

/**
 * Test connectivity — try anonymous call with a small bounding box.
 * Returns number of aircraft found.
 */
export async function testConnection(
  credentials: { clientId: string; clientSecret: string } | null
): Promise<number> {
  // Use a small area over central Europe as a quick connectivity test
  const bounds = { lamin: 47.0, lomin: 8.0, lamax: 48.0, lomax: 9.0 }
  const flights = await fetchStateVectors(bounds, credentials)
  return Object.keys(flights).length
}
