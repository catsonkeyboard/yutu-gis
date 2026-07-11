import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import maplibregl from 'maplibre-gl'
import { useSwipeStore } from '../../stores/swipeStore'
import { useLayerStore, type Layer } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getTileStyle } from './tileProviders'
import { convertToGcj02 } from '../../utils/coordTransform'
import { buildPaint } from '../StylePanel/styleUtils'

const DEFAULT_COLOR = '#0080ff'

interface Props {
  map: maplibregl.Map | null
}

/** Render one layer (the swipe layer) onto the overlay map. */
function renderSwipeLayer(overlay: maplibregl.Map, layer: Layer, needsGcj02: boolean): void {
  // Clear previous swipe layers
  const style = overlay.getStyle()
  if (!style) return
  style.layers
    .filter((l) => l.id.startsWith('swipe-'))
    .forEach((l) => {
      if (overlay.getLayer(l.id)) overlay.removeLayer(l.id)
    })
  Object.keys(style.sources)
    .filter((id) => id.startsWith('swipe-'))
    .forEach((id) => {
      if (overlay.getSource(id)) overlay.removeSource(id)
    })

  const sourceId = 'swipe-src'
  if (layer.type === 'raster') {
    const src = layer.source as {
      tiles: string[]
      bounds?: [number, number, number, number]
      minzoom?: number
      maxzoom?: number
    }
    overlay.addSource(sourceId, {
      type: 'raster',
      tiles: src.tiles,
      tileSize: 256,
      ...(src.bounds ? { bounds: src.bounds } : {}),
      minzoom: src.minzoom ?? 0,
      maxzoom: src.maxzoom ?? 19,
    })
    overlay.addLayer({
      id: 'swipe-raster',
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': layer.opacity },
    })
    return
  }
  if (layer.type !== 'geojson') return

  const data = needsGcj02
    ? convertToGcj02(layer.source as GeoJSON.FeatureCollection)
    : (layer.source as GeoJSON.FeatureCollection)
  overlay.addSource(sourceId, { type: 'geojson', data })
  const custom = layer.style ? buildPaint(layer.style, layer.opacity) : null
  overlay.addLayer({
    id: 'swipe-fill',
    type: 'fill',
    source: sourceId,
    filter: ['==', '$type', 'Polygon'],
    paint: (custom?.fill as never) ?? { 'fill-color': DEFAULT_COLOR, 'fill-opacity': layer.opacity * 0.4 },
  })
  overlay.addLayer({
    id: 'swipe-line',
    type: 'line',
    source: sourceId,
    filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    paint: (custom?.line as never) ?? { 'line-color': DEFAULT_COLOR, 'line-width': 1.5, 'line-opacity': layer.opacity },
  })
  overlay.addLayer({
    id: 'swipe-point',
    type: 'circle',
    source: sourceId,
    filter: ['==', '$type', 'Point'],
    paint: (custom?.circle as never) ?? {
      'circle-color': DEFAULT_COLOR,
      'circle-radius': 5,
      'circle-opacity': layer.opacity,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  })
}

export default function SwipeOverlay({ map }: Props): ReactElement | null {
  const { enabled, layerId, position, setPosition, setEnabled } = useSwipeStore()
  const layers = useLayerStore((s) => s.layers)
  const provider = useMapStore((s) => s.provider)
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<maplibregl.Map | null>(null)

  const swipeLayer = layers.find((l) => l.id === layerId)

  // Exit automatically when the swipe layer disappears
  useEffect(() => {
    if (enabled && layerId && !swipeLayer) setEnabled(false)
  }, [enabled, layerId, swipeLayer, setEnabled])

  // Overlay map lifecycle + camera sync
  useEffect(() => {
    if (!map || !enabled || !containerRef.current) return

    const overlay = new maplibregl.Map({
      container: containerRef.current,
      style: getTileStyle(useMapStore.getState().provider, useSettingsStore.getState().apiKeys),
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      interactive: false,
      attributionControl: false,
    })
    overlayRef.current = overlay

    const syncCamera = () => {
      overlay.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
    }
    map.on('move', syncCamera)

    return () => {
      map.off('move', syncCamera)
      overlay.remove()
      overlayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled])

  // Keep overlay basemap + swipe layer in sync with provider / layer changes
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !enabled || !swipeLayer) return
    const needsGcj02 = provider.startsWith('amap')

    const apply = () => renderSwipeLayer(overlay, swipeLayer, needsGcj02)
    if (overlay.isStyleLoaded()) apply()
    else overlay.once('styledata', apply)
  }, [enabled, swipeLayer, provider])

  // Provider switch → rebuild overlay style then re-add the layer
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !enabled) return
    overlay.setStyle(getTileStyle(provider, apiKeys))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, apiKeys])

  if (!enabled) return null

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      setPosition((ev.clientX - rect.left) / rect.width)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 450,
          clipPath: `inset(0 0 0 ${position * 100}%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Divider + drag handle */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${position * 100}%`,
          width: 2,
          background: '#1a6fb5',
          zIndex: 460,
          cursor: 'col-resize',
        }}
        onMouseDown={handleDragStart}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: -13,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#1a6fb5',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            userSelect: 'none',
          }}
        >
          ⇔
        </div>
      </div>
    </>
  )
}
