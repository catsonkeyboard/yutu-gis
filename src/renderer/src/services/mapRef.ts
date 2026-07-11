import type maplibregl from 'maplibre-gl'

/**
 * Module-level handle to the single MapLibre map instance, for features that
 * live outside MapCanvas (map export, etc.). Set/cleared by MapCanvas.
 */
let mapInstance: maplibregl.Map | null = null

export function setMap(map: maplibregl.Map | null): void {
  mapInstance = map
}

export function getMap(): maplibregl.Map | null {
  return mapInstance
}
