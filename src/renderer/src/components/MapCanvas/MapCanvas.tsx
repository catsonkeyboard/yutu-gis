import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useMapStore } from '../../stores/mapStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useLayerStore } from '../../stores/layerStore'
import type { Layer } from '../../stores/layerStore'
import { getTileStyle } from './tileProviders'
import BasemapSwitcher from './BasemapSwitcher'
import { convertToGcj02 } from '../../utils/coordTransform'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { useDrawStore } from '../../stores/drawStore'
import DrawHintBanner from './DrawHintBanner'
import MapContextMenu, { type ContextMenuPos } from './MapContextMenu'
import VehicleLayer, { bringVehicleLayersToTop } from './VehicleLayer'
import FlightLayer, { bringFlightLayersToTop } from './FlightLayer'

const DEFAULT_COLOR = '#0080ff'
const SELECTED_COLOR = '#ff7700'

interface Props {
  onSave?: () => void
  onOsmExtract?: (bounds: [number, number, number, number]) => void
}

export default function MapCanvas({ onSave, onOsmExtract }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const drawMode = useDrawStore((s) => s.drawMode)
  const drawModeRef = useRef(drawMode)
  const setFeatures = useDrawStore((s) => s.setFeatures)
  const { center, zoom, provider, fitBoundsRequest, setCenter, setZoom } = useMapStore()
  const { apiKeys } = useSettingsStore()
  const layers = useLayerStore((s) => s.layers)
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const setSelectedFeatureProps = useLayerStore((s) => s.setSelectedFeatureProps)
  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPos | null>(null)

  // Refs so event handlers always see current values without re-registering
  const selectedLayerIdRef = useRef(selectedLayerId)
  const layersRef = useRef(layers)
  const providerRef = useRef(provider)

  useEffect(() => { drawModeRef.current = drawMode }, [drawMode])
  useEffect(() => { selectedLayerIdRef.current = selectedLayerId }, [selectedLayerId])
  useEffect(() => { layersRef.current = layers }, [layers])
  useEffect(() => { providerRef.current = provider }, [provider])

  const renderLayers = (
    map: maplibregl.Map,
    layerList: Layer[],
    currentProvider = providerRef.current,
    currentSelectedId = selectedLayerIdRef.current,
  ) => {
    const needsGcj02 = currentProvider.startsWith('amap')
    // Remove all user layers first
    const existingLayers = map.getStyle().layers
      .filter((l) => l.id.startsWith('user-'))
      .map((l) => l.id)
    existingLayers.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    // Remove user sources
    const style = map.getStyle()
    Object.keys(style.sources)
      .filter((id) => id.startsWith('user-'))
      .forEach((id) => {
        if (map.getSource(id)) map.removeSource(id)
      })

    // Add current visible layers
    layerList
      .filter((l) => l.visible && l.type === 'geojson')
      .forEach((layer) => {
        const sourceId = `user-${layer.id}`
        const isSelected = layer.id === currentSelectedId
        const color = isSelected ? SELECTED_COLOR : DEFAULT_COLOR
        const data = needsGcj02
          ? convertToGcj02(layer.source as GeoJSON.FeatureCollection)
          : (layer.source as GeoJSON.FeatureCollection)
        map.addSource(sourceId, { type: 'geojson', data })
        map.addLayer({
          id: `user-${layer.id}-fill`,
          type: 'fill',
          source: sourceId,
          filter: ['==', '$type', 'Polygon'],
          paint: { 'fill-color': color, 'fill-opacity': layer.opacity * 0.4 },
        })
        map.addLayer({
          id: `user-${layer.id}-line`,
          type: 'line',
          source: sourceId,
          filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
          paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': layer.opacity },
        })
        map.addLayer({
          id: `user-${layer.id}-point`,
          type: 'circle',
          source: sourceId,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-color': color,
            'circle-radius': 5,
            'circle-opacity': layer.opacity,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
          },
        })
      })

    // Ensure vehicle layers stay on top of user data layers
    bringVehicleLayersToTop(map)
    bringFlightLayersToTop(map)
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (drawModeRef.current !== 'off') return
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    const bounds: [number, number, number, number] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
    setContextMenuPos({ x: e.clientX, y: e.clientY, bounds })
  }

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getTileStyle(provider, apiKeys),
      center: center,
      zoom: zoom,
      attributionControl: {},
    })

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    const draw = new MapboxDraw({ displayControlsDefault: false })
    map.addControl(draw as unknown as maplibregl.IControl)
    drawRef.current = draw

    const syncFeatures = () => {
      setFeatures(draw.getAll().features as GeoJSON.Feature[])
    }
    map.on('draw.create', syncFeatures)
    map.on('draw.update', syncFeatures)
    map.on('draw.delete', syncFeatures)

    map.on('move', () => {
      const c = map.getCenter()
      setCenter([parseFloat(c.lng.toFixed(6)), parseFloat(c.lat.toFixed(6))])
      setZoom(parseFloat(map.getZoom().toFixed(2)))
    })

    // Click: select layer by clicking on its features
    map.on('click', (e) => {
      if (drawModeRef.current !== 'off') return
      const style = map.getStyle()
      if (!style) return
      const userLayerIds = style.layers
        .filter((l) => l.id.startsWith('user-'))
        .map((l) => l.id)
      if (!userLayerIds.length) return
      const hits = map.queryRenderedFeatures(e.point, { layers: userLayerIds })
      if (!hits.length) return
      const match = hits[0].layer.id.match(/^user-(.+)-(fill|line|point)$/)
      if (match) {
        setSelectedLayer(match[1])
        setSelectedFeatureProps((hits[0].properties ?? {}) as Record<string, unknown>)
      }
    })

    // Pointer cursor when hovering over user features
    map.on('mousemove', (e) => {
      if (drawModeRef.current !== 'off') {
        map.getCanvas().style.cursor = ''
        return
      }
      const style = map.getStyle()
      if (!style) return
      const userLayerIds = style.layers
        .filter((l) => l.id.startsWith('user-'))
        .map((l) => l.id)
      const hits = userLayerIds.length
        ? map.queryRenderedFeatures(e.point, { layers: userLayerIds })
        : []
      map.getCanvas().style.cursor = hits.length ? 'pointer' : ''
    })

    mapRef.current = map
    setMapInstance(map)

    return () => {
      map.remove()
      mapRef.current = null
      setMapInstance(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit map bounds when requested
  useEffect(() => {
    const map = mapRef.current
    if (!map || !fitBoundsRequest) return
    map.fitBounds(fitBoundsRequest.bounds as maplibregl.LngLatBoundsLike, { padding: 60, maxZoom: 16 })
  }, [fitBoundsRequest])

  // Update style when provider or API keys change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(getTileStyle(provider, apiKeys))
    map.once('styledata', () => renderLayers(map, layersRef.current, provider))
  }, [provider, apiKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync user layers to map
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) {
      renderLayers(map, layers)
    } else {
      map.once('styledata', () => renderLayers(map, layersRef.current))
    }
  }, [layers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update highlight color when selection changes (fast path — no full re-render)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    layersRef.current.forEach((layer) => {
      const isSelected = layer.id === selectedLayerId
      const color = isSelected ? SELECTED_COLOR : DEFAULT_COLOR
      const fillId = `user-${layer.id}-fill`
      const lineId = `user-${layer.id}-line`
      const pointId = `user-${layer.id}-point`
      if (map.getLayer(fillId)) map.setPaintProperty(fillId, 'fill-color', color)
      if (map.getLayer(lineId)) map.setPaintProperty(lineId, 'line-color', color)
      if (map.getLayer(pointId)) map.setPaintProperty(pointId, 'circle-color', color)
    })
  }, [selectedLayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // React to drawMode changes
  useEffect(() => {
    const draw = drawRef.current
    if (!draw || !mapRef.current) return

    if (drawMode === 'off') {
      draw.changeMode('simple_select')
      draw.deleteAll()
    } else if (drawMode === 'point') {
      draw.changeMode('draw_point')
    } else if (drawMode === 'line') {
      draw.changeMode('draw_line_string')
    } else if (drawMode === 'polygon') {
      draw.changeMode('draw_polygon')
    }
  }, [drawMode])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onContextMenu={handleContextMenu}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <VehicleLayer map={mapInstance} />
      <FlightLayer map={mapInstance} />
      <MapContextMenu
        pos={contextMenuPos}
        onExtract={(bounds) => onOsmExtract?.(bounds)}
        onClose={() => setContextMenuPos(null)}
      />
      <DrawHintBanner onSave={onSave} />
      <BasemapSwitcher />
    </div>
  )
}
