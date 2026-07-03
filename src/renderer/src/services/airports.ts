/**
 * Offline airport lookup by IATA code.
 *
 * Data source: OurAirports (https://ourairports.com/data/, public domain),
 * filtered to airports with a 3-letter IATA code. Format:
 *   { "PEK": ["Beijing Capital International Airport", 40.07735, 116.5967], ... }
 */

import airportsData from '../assets/airports-iata.json'

const AIRPORTS = airportsData as unknown as Record<string, [string, number, number]>

// The dataset only has center coordinates, so pad a fixed radius around the
// point for fitBounds — ~0.05° covers even the largest airfields.
const BBOX_PAD = 0.05

export interface AirportInfo {
  iata: string
  name: string
  bbox: [number, number, number, number] // [west, south, east, north]
}

export function searchAirportByIata(code: string): AirportInfo {
  const iata = code.toUpperCase().trim()
  const entry = AIRPORTS[iata]
  if (!entry) {
    throw new Error(`未找到 IATA 代码为 ${iata} 的机场`)
  }
  const [name, lat, lon] = entry
  return {
    iata,
    name,
    bbox: [lon - BBOX_PAD, lat - BBOX_PAD, lon + BBOX_PAD, lat + BBOX_PAD]
  }
}
