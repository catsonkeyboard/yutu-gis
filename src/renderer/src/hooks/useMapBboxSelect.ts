import { useEffect } from 'react'
import maplibregl from 'maplibre-gl'

export type MapBbox = [number, number, number, number] // [south, west, north, east]

export const r6 = (n: number): number => parseFloat(n.toFixed(6))

function bboxToGeoJSON(bbox: MapBbox): GeoJSON.Feature {
  const [south, west, north, east] = bbox
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, south], [east, south], [east, north], [west, north], [west, south]
      ]]
    }
  }
}

function applyBboxOverlay(
  map: maplibregl.Map,
  sourceId: string,
  color: string,
  bbox: MapBbox | null
): void {
  const fillId = `${sourceId}-fill`
  const lineId = `${sourceId}-line`
  if (!bbox) {
    if (map.getLayer(fillId)) map.removeLayer(fillId)
    if (map.getLayer(lineId)) map.removeLayer(lineId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  const data = bboxToGeoJSON(bbox)
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
  if (src) {
    src.setData(data)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data })
  map.addLayer({
    id: fillId,
    type: 'fill',
    source: sourceId,
    paint: { 'fill-color': color, 'fill-opacity': 0.08 }
  })
  map.addLayer({
    id: lineId,
    type: 'line',
    source: sourceId,
    paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 2] }
  })
}

interface Options {
  map: maplibregl.Map | null
  /** Overlay visible (usually: panel open) */
  active: boolean
  bbox: MapBbox | null
  selecting: boolean
  setBbox: (bbox: MapBbox) => void
  setSelecting: (selecting: boolean) => void
  /** Unique map source id, e.g. 'tiles-bbox' */
  sourceId: string
  color: string
  /** Current basemap provider — style switches wipe custom sources, re-mount */
  provider: string
}

/**
 * Drives a dashed-rectangle bbox overlay plus a drag-to-select interaction
 * on the map. Shared by the floating tool panels (tiles download, OSM extract).
 */
export function useMapBboxSelect({
  map, active, bbox, selecting, setBbox, setSelecting, sourceId, color, provider
}: Options): void {
  // Render / update / remove the rectangle overlay
  useEffect(() => {
    if (!map) return
    const apply = () => applyBboxOverlay(map, sourceId, color, active ? bbox : null)
    if (map.isStyleLoaded()) apply()
    else map.once('styledata', apply)
  }, [map, bbox, active, provider, sourceId, color])

  // Drag-selection: pause map panning, mousedown-drag-mouseup draws the box
  useEffect(() => {
    if (!map || !selecting) return
    const canvas = map.getCanvas()
    map.dragPan.disable()
    canvas.style.cursor = 'crosshair'
    let start: maplibregl.LngLat | null = null

    const toBbox = (a: maplibregl.LngLat, b: maplibregl.LngLat): MapBbox => [
      r6(Math.min(a.lat, b.lat)), r6(Math.min(a.lng, b.lng)),
      r6(Math.max(a.lat, b.lat)), r6(Math.max(a.lng, b.lng))
    ]
    const onDown = (e: maplibregl.MapMouseEvent) => { start = e.lngLat }
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (start) setBbox(toBbox(start, e.lngLat))
    }
    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (start) setBbox(toBbox(start, e.lngLat))
      start = null
      setSelecting(false)
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    return () => {
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      map.dragPan.enable()
      canvas.style.cursor = ''
    }
  }, [map, selecting, setBbox, setSelecting])
}

/** Current viewport as a MapBbox. */
export function viewportBbox(map: maplibregl.Map): MapBbox {
  const b = map.getBounds()
  return [r6(b.getSouth()), r6(b.getWest()), r6(b.getNorth()), r6(b.getEast())]
}
