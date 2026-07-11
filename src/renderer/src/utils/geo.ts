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

/**
 * Bounds of a single feature; points get a small buffer so fitBounds
 * has a meaningful area.
 */
export function getFeatureBounds(
  feature: GeoJSON.Feature
): [[number, number], [number, number]] | null {
  const bounds = getGeoJSONBounds({ type: 'FeatureCollection', features: [feature] })
  if (!bounds) return null
  const [[minLon, minLat], [maxLon, maxLat]] = bounds
  if (minLon === maxLon && minLat === maxLat) {
    const d = 0.005
    return [
      [minLon - d, minLat - d],
      [maxLon + d, maxLat + d],
    ]
  }
  return bounds
}

/**
 * Whether a feature's properties match the currently selected feature props.
 * OSM features compare by (_osm_id, _osm_type); everything else by deep equality.
 */
export function matchesSelectedProps(
  props: Record<string, unknown>,
  selected: Record<string, unknown> | null
): boolean {
  if (!selected) return false
  if (props._osm_id !== undefined && selected._osm_id !== undefined) {
    return props._osm_id === selected._osm_id && props._osm_type === selected._osm_type
  }
  return JSON.stringify(props) === JSON.stringify(selected)
}
