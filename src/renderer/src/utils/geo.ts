/**
 * Compute the bounding box [[minLng, minLat], [maxLng, maxLat]] of a GeoJSON FeatureCollection.
 * Returns null if the collection is empty or has no geometry.
 */
export function getGeoJSONBounds(
  geojson: GeoJSON.FeatureCollection
): [[number, number], [number, number]] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  function processCoords(coords: unknown): void {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords as number[]
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    } else {
      coords.forEach(processCoords)
    }
  }

  for (const feature of geojson.features) {
    if (feature.geometry && 'coordinates' in feature.geometry) {
      processCoords(feature.geometry.coordinates)
    }
  }

  if (!isFinite(minLng)) return null
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}
