import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import { useVehicleStore } from '../../stores/vehicleStore'

interface Props {
  map: maplibregl.Map | null
}

const VEHICLE_SOURCE = 'vehicle-points'
const VEHICLE_CIRCLE = 'vehicle-circle'
const VEHICLE_LABEL = 'vehicle-label'

/** Build a GeoJSON FeatureCollection for current device positions */
function buildPointsFC(
  devices: ReturnType<typeof useVehicleStore.getState>['devices']
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(devices).map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
      properties: {
        devNo: d.devNo,
        speed: d.speed,
        direct: d.direct,
      },
    })),
  }
}

function ensureSourceAndLayers(map: maplibregl.Map): void {
  if (!map.getSource(VEHICLE_SOURCE)) {
    map.addSource(VEHICLE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }

  if (!map.getLayer(VEHICLE_CIRCLE)) {
    map.addLayer({
      id: VEHICLE_CIRCLE,
      type: 'circle',
      source: VEHICLE_SOURCE,
      paint: {
        'circle-color': '#ff3b30',
        'circle-radius': 7,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
      layout: {
        'circle-sort-key': 9999,
      },
    })
  }

  if (!map.getLayer(VEHICLE_LABEL)) {
    map.addLayer({
      id: VEHICLE_LABEL,
      type: 'symbol',
      source: VEHICLE_SOURCE,
      layout: {
        'text-field': ['get', 'devNo'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 1.2],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#1a1a2e',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }
}

/** Move vehicle layers to the top of the layer stack so they are never occluded by user data layers */
export function bringVehicleLayersToTop(map: maplibregl.Map): void {
  ;[VEHICLE_CIRCLE, VEHICLE_LABEL].forEach((id) => {
    if (map.getLayer(id)) {
      map.moveLayer(id)
    }
  })
}

function removeSourceAndLayers(map: maplibregl.Map): void {
  ;[VEHICLE_LABEL, VEHICLE_CIRCLE].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(VEHICLE_SOURCE)) map.removeSource(VEHICLE_SOURCE)
}

export default function VehicleLayer({ map }: Props) {
  const devices = useVehicleStore((s) => s.devices)
  const connected = useVehicleStore((s) => s.connected)
  const layersAddedRef = useRef(false)

  // Add/remove source+layers based on connection state
  useEffect(() => {
    if (!map) return

    const setup = () => {
      if (connected) {
        ensureSourceAndLayers(map)
        layersAddedRef.current = true
      } else if (layersAddedRef.current) {
        removeSourceAndLayers(map)
        layersAddedRef.current = false
      }
    }

    if (map.isStyleLoaded()) {
      setup()
    } else {
      map.once('styledata', setup)
    }
  }, [map, connected])

  // Update source data on every device change
  useEffect(() => {
    if (!map || !layersAddedRef.current) return
    const src = map.getSource(VEHICLE_SOURCE) as maplibregl.GeoJSONSource | undefined
    src?.setData(buildPointsFC(devices))
  }, [map, devices])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map && layersAddedRef.current) {
        try { removeSourceAndLayers(map) } catch { /* map may already be destroyed */ }
        layersAddedRef.current = false
      }
    }
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
