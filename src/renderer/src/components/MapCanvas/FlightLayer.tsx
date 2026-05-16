import { useEffect, useRef, useCallback } from 'react'
import type maplibregl from 'maplibre-gl'
import { useFlightStore, type FlightState } from '../../stores/flightStore'
import { fetchStateVectors, fetchAccessToken } from '../../services/opensky'
import { fetchAdsbfiFlights } from '../../services/adsbfi'

interface Props {
  map: maplibregl.Map | null
}

const FLIGHT_SOURCE = 'flight-points'
const FLIGHT_SYMBOL = 'flight-symbol'
const FLIGHT_LABEL = 'flight-label'

/** Build a GeoJSON FeatureCollection for current flight positions */
function buildFlightFC(flights: Record<string, FlightState>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(flights)
      .filter((f) => f.latitude != null && f.longitude != null)
      .map((f) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [f.longitude!, f.latitude!]
        },
        properties: {
          icao24: f.icao24,
          callsign: f.callsign || f.icao24,
          originCountry: f.originCountry,
          altitude: f.baroAltitude != null ? Math.round(f.baroAltitude) : null,
          velocity: f.velocity != null ? Math.round(f.velocity) : null,
          trueTrack: f.trueTrack ?? 0,
          onGround: f.onGround,
          verticalRate: f.verticalRate
        }
      }))
  }
}

function ensureSourceAndLayers(map: maplibregl.Map): void {
  if (!map.getSource(FLIGHT_SOURCE)) {
    map.addSource(FLIGHT_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })
  }

  if (!map.getLayer(FLIGHT_SYMBOL)) {
    map.addLayer({
      id: FLIGHT_SYMBOL,
      type: 'symbol',
      source: FLIGHT_SOURCE,
      layout: {
        'icon-image': 'flight-icon',
        'icon-size': 0.8,
        'icon-rotate': ['get', 'trueTrack'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    })
  }

  if (!map.getLayer(FLIGHT_LABEL)) {
    map.addLayer({
      id: FLIGHT_LABEL,
      type: 'symbol',
      source: FLIGHT_SOURCE,
      layout: {
        'text-field': ['get', 'callsign'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 1.4],
        'text-allow-overlap': false,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
      },
      paint: {
        'text-color': '#1a3a5c',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5
      }
    })
  }
}

/** Move flight layers to the top of the layer stack */
export function bringFlightLayersToTop(map: maplibregl.Map): void {
  ;[FLIGHT_SYMBOL, FLIGHT_LABEL].forEach((id) => {
    if (map.getLayer(id)) {
      map.moveLayer(id)
    }
  })
}

function removeSourceAndLayers(map: maplibregl.Map): void {
  ;[FLIGHT_LABEL, FLIGHT_SYMBOL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(FLIGHT_SOURCE)) map.removeSource(FLIGHT_SOURCE)
}

/** Create the airplane icon as a data URL image and add it to the map */
function ensureFlightIcon(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => {
    if (map.hasImage('flight-icon')) {
      resolve()
      return
    }

    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Draw airplane shape pointing north (up)
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#1a6fb5'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1

    ctx.beginPath()
    // Fuselage
    ctx.moveTo(16, 2) // nose
    ctx.lineTo(18, 10)
    ctx.lineTo(28, 16) // right wing tip
    ctx.lineTo(18, 15)
    ctx.lineTo(19, 22)
    ctx.lineTo(23, 26) // right tail
    ctx.lineTo(16, 24) // tail center
    ctx.lineTo(9, 26) // left tail
    ctx.lineTo(13, 22)
    ctx.lineTo(14, 15)
    ctx.lineTo(4, 16) // left wing tip
    ctx.lineTo(14, 10)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    const img = new Image(size, size)
    img.onload = () => {
      if (!map.hasImage('flight-icon')) {
        map.addImage('flight-icon', img)
      }
      resolve()
    }
    img.src = canvas.toDataURL()
  })
}

/**
 * Calculate the approximate radius in nautical miles that covers the current map viewport.
 * Uses the distance from center to corner.
 */
function getBoundsRadiusNm(map: maplibregl.Map): { lat: number; lon: number; distNm: number } {
  const center = map.getCenter()
  const bounds = map.getBounds()
  const lat = center.lat
  const lon = center.lng

  // Haversine approximation for center-to-corner distance
  const dLat = ((bounds.getNorth() - bounds.getSouth()) / 2) * (Math.PI / 180)
  const dLon = ((bounds.getEast() - bounds.getWest()) / 2) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat * (Math.PI / 180)) * Math.cos(bounds.getNorth() * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distKm = 6371 * c
  const distNm = Math.min(250, Math.max(5, Math.round(distKm / 1.852)))

  return { lat, lon, distNm }
}

export default function FlightLayer({ map }: Props) {
  const flights = useFlightStore((s) => s.flights)
  const active = useFlightStore((s) => s.active)
  const pollInterval = useFlightStore((s) => s.pollInterval)
  const dataSource = useFlightStore((s) => s.dataSource)
  const layersAddedRef = useRef(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { setFlights, setLastUpdate, setError, setFetching, setToken, clearToken } =
    useFlightStore.getState()

  // Fetch flights based on current map bounds and active data source
  const fetchFlights = useCallback(async () => {
    if (!map) return

    const store = useFlightStore.getState()
    if (!store.active) return

    setFetching(true)
    setError(null)

    try {
      let result: Record<string, FlightState>

      if (store.dataSource === 'opensky') {
        const b = map.getBounds()
        const bounds = {
          lamin: b.getSouth(),
          lomin: b.getWest(),
          lamax: b.getNorth(),
          lomax: b.getEast()
        }

        let token = store.accessToken
        if (store.openSkyConfig.clientId && store.openSkyConfig.clientSecret) {
          if (!token || (store.tokenExpiresAt && Date.now() >= store.tokenExpiresAt)) {
            const tokenResp = await fetchAccessToken(store.openSkyConfig.clientId, store.openSkyConfig.clientSecret)
            token = tokenResp.access_token
            setToken(token, tokenResp.expires_in)
          }
        }

        result = await fetchStateVectors(bounds, token)
      } else {
        // adsb.fi: use center + radius
        const { lat, lon, distNm } = getBoundsRadiusNm(map)
        result = await fetchAdsbfiFlights(lat, lon, distNm)
      }

      setFlights(result)
      setLastUpdate(Date.now())
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') {
        clearToken()
        setError('Token 已过期，正在重新获取...')
      } else {
        setError(msg)
      }
    } finally {
      setFetching(false)
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  // Add/remove source+layers based on active state
  useEffect(() => {
    if (!map) return

    const setup = async () => {
      if (active) {
        await ensureFlightIcon(map)
        ensureSourceAndLayers(map)
        layersAddedRef.current = true
        // Do immediate fetch
        fetchFlights()
      } else if (layersAddedRef.current) {
        removeSourceAndLayers(map)
        layersAddedRef.current = false
      }
    }

    if (map.isStyleLoaded()) {
      setup()
    } else {
      map.once('styledata', () => setup())
    }
  }, [map, active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-create layers after a style change (e.g. switching tile providers)
  // setStyle() wipes all sources/layers/images — we must re-add them.
  useEffect(() => {
    if (!map) return

    const handleStyleLoad = async (): Promise<void> => {
      if (!useFlightStore.getState().active) return
      await ensureFlightIcon(map)
      ensureSourceAndLayers(map)
      layersAddedRef.current = true
      // Re-populate with current flight data
      const currentFlights = useFlightStore.getState().flights
      const src = map.getSource(FLIGHT_SOURCE) as maplibregl.GeoJSONSource | undefined
      src?.setData(buildFlightFC(currentFlights))
    }

    map.on('style.load', handleStyleLoad)
    return () => {
      map.off('style.load', handleStyleLoad)
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set up polling timer — react to dataSource/pollInterval changes
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }

    if (active && map) {
      const minInterval = dataSource === 'adsbfi' ? 5 : 10
      const interval = Math.max(minInterval, pollInterval) * 1000
      pollTimerRef.current = setInterval(fetchFlights, interval)
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [active, pollInterval, dataSource, map, fetchFlights])

  // Update source data on every flight change
  useEffect(() => {
    if (!map || !layersAddedRef.current) return
    const src = map.getSource(FLIGHT_SOURCE) as maplibregl.GeoJSONSource | undefined
    src?.setData(buildFlightFC(flights))
  }, [map, flights])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      if (map && layersAddedRef.current) {
        try {
          removeSourceAndLayers(map)
        } catch {
          /* map may already be destroyed */
        }
        layersAddedRef.current = false
      }
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
