/**
 * OpenSky Network API client (renderer side)
 *
 * All HTTP requests are routed through the Electron main process via IPC
 * to avoid CORS restrictions. The main process uses Node.js `https` module.
 *
 * State vector indices:
 *  0: icao24, 1: callsign, 2: origin_country, 3: time_position, 4: last_contact,
 *  5: longitude, 6: latitude, 7: baro_altitude, 8: on_ground, 9: velocity,
 * 10: true_track, 11: vertical_rate, 12: sensors, 13: geo_altitude, 14: squawk,
 * 15: spi, 16: position_source, 17: category
 */

import type { FlightState } from '../stores/flightStore'

/**
 * Exchange client_id + client_secret for an access token.
 * Returns { access_token, expires_in }.
 */
export async function fetchAccessToken(
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  return window.electronAPI.openSkyFetchToken(clientId, clientSecret)
}

/**
 * Fetch state vectors for a bounding box.
 * If token is provided, uses authenticated mode (higher rate limit).
 * If token is null, uses anonymous mode.
 */
export async function fetchStateVectors(
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number },
  token: string | null
): Promise<Record<string, FlightState>> {
  const data = await window.electronAPI.openSkyFetchStates(bounds, token)

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
      category: (sv[17] as number) ?? 0,
    }
  }

  return flights
}

/**
 * Test connectivity — try anonymous call with a small bounding box.
 * Returns number of aircraft found.
 */
export async function testConnection(
  token: string | null
): Promise<number> {
  // Use a small area over central Europe as a quick connectivity test
  const bounds = { lamin: 47.0, lomin: 8.0, lamax: 48.0, lomax: 9.0 }
  const flights = await fetchStateVectors(bounds, token)
  return Object.keys(flights).length
}
