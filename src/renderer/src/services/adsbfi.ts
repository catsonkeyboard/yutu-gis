/**
 * adsb.fi Open Data API client (renderer side)
 *
 * All HTTP requests are routed through the Electron main process via IPC
 * to avoid CORS restrictions.
 *
 * API: GET /v3/lat/{lat}/lon/{lon}/dist/{dist}
 * Returns ADSBexchange v2 compatible aircraft data.
 * Rate limit: 1 request per second.
 */

import type { FlightState } from '../stores/flightStore'

/**
 * Fetch aircraft within a radius from a center point.
 * distNm is in nautical miles (max 250).
 */
export async function fetchAdsbfiFlights(
  lat: number,
  lon: number,
  distNm: number
): Promise<Record<string, FlightState>> {
  const data = await window.electronAPI.adsbfiFetchByLocation(lat, lon, distNm)

  const flights: Record<string, FlightState> = {}

  if (!data.ac) return flights

  for (const ac of data.ac) {
    if (ac.lat == null || ac.lon == null) continue

    const altBaro =
      ac.alt_baro === 'ground' ? 0 : ac.alt_baro != null ? ac.alt_baro * 0.3048 : null // ft → m
    const onGround = ac.alt_baro === 'ground'

    flights[ac.hex] = {
      icao24: ac.hex,
      callsign: ac.flight?.trim() || null,
      originCountry: '', // adsb.fi doesn't provide origin country
      longitude: ac.lon,
      latitude: ac.lat,
      baroAltitude: altBaro,
      onGround,
      velocity: ac.gs != null ? ac.gs * 0.514444 : null, // knots → m/s
      trueTrack: ac.track ?? null,
      verticalRate: ac.baro_rate != null ? ac.baro_rate * 0.00508 : null, // ft/min → m/s
      geoAltitude: ac.alt_geom != null ? ac.alt_geom * 0.3048 : null,
      squawk: ac.squawk ?? null,
      category: 0,
    }
  }

  return flights
}

/**
 * Test adsb.fi connectivity — fetch a small area
 */
export async function testAdsbfiConnection(): Promise<number> {
  const flights = await fetchAdsbfiFlights(47.5, 8.5, 25)
  return Object.keys(flights).length
}
