import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import maplibregl from 'maplibre-gl'
import { Button, ButtonGroup, Classes, Intent } from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useMeasureStore } from '../../stores/measureStore'
import { useMapStore } from '../../stores/mapStore'
import { wgs84ToGcj02, gcj02ToWgs84 } from '../../utils/coordTransform'
import { pathLength, sphericalArea, formatDistance, formatArea } from '../../utils/geodesy'

const SRC = 'measure-src'
const COLOR = '#fa8c16'

/** Keep measurement graphics above user data layers after a full re-render. */
export function bringMeasureLayersToTop(map: maplibregl.Map): void {
  for (const id of ['measure-fill', 'measure-line', 'measure-point']) {
    if (map.getLayer(id)) map.moveLayer(id)
  }
}

interface Props {
  map: maplibregl.Map | null
}

export default function MeasureLayer({ map }: Props): ReactElement | null {
  const { t } = useTranslation()
  const { mode, vertices, completed, setMode, clearAll } = useMeasureStore()
  const provider = useMapStore((s) => s.provider)
  const [hover, setHover] = useState<[number, number] | null>(null)

  // Register interaction handlers while measuring
  useEffect(() => {
    if (!map || mode === 'off') return
    const store = useMeasureStore.getState()
    const isAmap = useMapStore.getState().provider.startsWith('amap')
    const toWgs84 = (lngLat: maplibregl.LngLat): [number, number] =>
      isAmap ? gcj02ToWgs84(lngLat.lng, lngLat.lat) : [lngLat.lng, lngLat.lat]

    const onClick = (e: maplibregl.MapMouseEvent) => store.addVertex(toWgs84(e.lngLat))
    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault()
      store.finishSegment()
    }
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault()
      store.undoVertex()
    }
    const onMove = (e: maplibregl.MapMouseEvent) => setHover(toWgs84(e.lngLat))

    map.on('click', onClick)
    map.on('dblclick', onDblClick)
    map.on('contextmenu', onContextMenu)
    map.on('mousemove', onMove)
    map.doubleClickZoom.disable()
    map.getCanvas().style.cursor = 'crosshair'

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDblClick)
      map.off('contextmenu', onContextMenu)
      map.off('mousemove', onMove)
      map.doubleClickZoom.enable()
      map.getCanvas().style.cursor = ''
      setHover(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mode])

  // Render measurement geometry
  useEffect(() => {
    if (!map) return

    const render = () => {
      const needsGcj02 = provider.startsWith('amap')
      const conv = (c: [number, number]): [number, number] =>
        needsGcj02 ? wgs84ToGcj02(c[0], c[1]) : c

      const features: GeoJSON.Feature[] = []
      for (const m of completed) {
        const coords = m.coords.map(conv)
        if (m.kind === 'area') {
          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
            properties: {},
          })
        } else {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {},
          })
        }
        coords.forEach((c) =>
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })
        )
      }
      if (mode !== 'off' && vertices.length) {
        const live = [...vertices, ...(hover ? [hover] : [])].map(conv)
        if (mode === 'area' && live.length >= 3) {
          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[...live, live[0]]] },
            properties: {},
          })
        }
        if (live.length >= 2) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: live },
            properties: {},
          })
        }
        vertices
          .map(conv)
          .forEach((c) =>
            features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })
          )
      }

      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
      if (src) {
        src.setData(fc)
      } else {
        map.addSource(SRC, { type: 'geojson', data: fc })
        map.addLayer({
          id: 'measure-fill',
          type: 'fill',
          source: SRC,
          filter: ['==', '$type', 'Polygon'],
          paint: { 'fill-color': COLOR, 'fill-opacity': 0.15 },
        })
        map.addLayer({
          id: 'measure-line',
          type: 'line',
          source: SRC,
          filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
          paint: { 'line-color': COLOR, 'line-width': 2, 'line-dasharray': [2, 1.5] },
        })
        map.addLayer({
          id: 'measure-point',
          type: 'circle',
          source: SRC,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-color': COLOR,
            'circle-radius': 4,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
          },
        })
      }
    }

    if (map.isStyleLoaded()) render()
    else map.once('styledata', render)

    const onStyleLoad = () => render()
    map.on('style.load', onStyleLoad)
    return () => {
      map.off('style.load', onStyleLoad)
    }
  }, [map, mode, vertices, completed, hover, provider])

  if (mode === 'off') return null

  const liveCoords = [...vertices, ...(hover && vertices.length ? [hover] : [])]
  const liveValue =
    mode === 'distance'
      ? liveCoords.length >= 2
        ? formatDistance(pathLength(liveCoords))
        : null
      : liveCoords.length >= 3
        ? formatArea(sphericalArea(liveCoords))
        : null
  const lastCompleted = completed.length ? completed[completed.length - 1] : null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        zIndex: 640,
        padding: '5px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: '1px solid var(--color-border, #d9dce0)',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600, color: COLOR }}>
        {mode === 'distance' ? t('measure.distanceMode') : t('measure.areaMode')}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 70, fontWeight: 500 }}>
        {liveValue ??
          (lastCompleted
            ? lastCompleted.kind === 'distance'
              ? formatDistance(lastCompleted.value)
              : formatArea(lastCompleted.value)
            : '—')}
      </span>
      <span className={Classes.TEXT_MUTED} style={{ fontSize: 11 }}>
        {t('measure.hint')}
      </span>
      <ButtonGroup size="small">
        <Button
          onClick={clearAll}
          disabled={!completed.length && !vertices.length}
          text={t('measure.clear')}
        />
        <Button
          intent={Intent.PRIMARY}
          onClick={() => setMode('off')}
          text={t('measure.exit')}
        />
      </ButtonGroup>
    </div>
  )
}
