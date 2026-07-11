import { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import {
  useMonitorStore,
  OWM_LAYERS,
  type OwmOverlayKey,
  type GibsOverlayKey,
} from '../../stores/monitorStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useMapStore } from '../../stores/mapStore'
import { useDrawStore } from '../../stores/drawStore'
import {
  fetchEarthquakes,
  fetchTyphoons,
  fetchRainviewerFrames,
  fetchFires,
  fetchGdacs,
  fetchWaqi,
  getOwmTileTemplate,
  getGibsTileTemplate,
  GIBS_LAYERS,
  parseApiError,
} from '../../services/api'
import { convertToGcj02 } from '../../utils/coordTransform'

interface Props {
  map: maplibregl.Map | null
}

// Raster overlays sit below user data layers; vector overlays ('monitor-v-*')
// are kept on top of everything (see bringMonitorLayersToTop).
const RADAR_ID = 'monitor-radar'
const QUAKE_SOURCE = 'monitor-quake'
const QUAKE_LAYER = 'monitor-v-quake'
const TY_SOURCE = 'monitor-typhoon'
const TY_LAYERS = {
  track: 'monitor-v-ty-track',
  forecast: 'monitor-v-ty-forecast',
  points: 'monitor-v-ty-points',
  fpoints: 'monitor-v-ty-fpoints',
  label: 'monitor-v-ty-label',
}
const FIRE_SOURCE = 'monitor-fire'
const FIRE_LAYER = 'monitor-v-fire'
const GDACS_SOURCE = 'monitor-gdacs'
const GDACS_LAYER = 'monitor-v-gdacs'
const GDACS_LABEL = 'monitor-v-gdacs-label'
const AQI_SOURCE = 'monitor-aqi'
const AQI_LAYER = 'monitor-v-aqi'
const AQI_LABEL = 'monitor-v-aqi-label'

const MONITOR_POINT_LAYERS = [
  QUAKE_LAYER,
  TY_LAYERS.points,
  TY_LAYERS.fpoints,
  GDACS_LAYER,
  AQI_LAYER,
  FIRE_LAYER,
]

const QUAKE_REFRESH_MS = 5 * 60 * 1000
const TYPHOON_REFRESH_MS = 10 * 60 * 1000
const RADAR_REFRESH_MS = 10 * 60 * 1000
const FIRE_REFRESH_MS = 30 * 60 * 1000
const GDACS_REFRESH_MS = 10 * 60 * 1000
const AQI_REFRESH_MS = 10 * 60 * 1000
const AQI_MOVE_DEBOUNCE_MS = 1200

// CMA typhoon intensity colors
const TY_COLOR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'strong'],
  '热带低压(TD)', '#30cc31',
  '热带风暴(TS)', '#307efa',
  '强热带风暴(STS)', '#e7c722',
  '台风(TY)', '#fb9d33',
  '强台风(STY)', '#f224f2',
  '超强台风(SuperTY)', '#fa3833',
  '#888888',
]

// GDACS alert level colors
const GDACS_COLOR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'alertlevel'],
  'Red', '#f5222d',
  'Orange', '#fa8c16',
  '#52c41a',
]

// US EPA AQI category colors
const AQI_COLOR: maplibregl.ExpressionSpecification = [
  'step',
  ['get', 'aqi'],
  '#009966', 51, '#ffde33', 101, '#ff9933', 151, '#cc0033', 201, '#660099', 301, '#7e0023',
]

const GDACS_EVENT_LABELS: Record<string, string> = {
  EQ: '地震',
  TC: '热带气旋',
  FL: '洪水',
  VO: '火山',
  WF: '野火',
  DR: '干旱',
  TS: '海啸',
}

/** Move all monitor vector layers to the top of the layer stack */
export function bringMonitorLayersToTop(map: maplibregl.Map): void {
  const style = map.getStyle()
  if (!style) return
  style.layers
    .filter((l) => l.id.startsWith('monitor-v-'))
    .forEach((l) => map.moveLayer(l.id))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function formatTime(v: unknown): string {
  if (typeof v === 'number') return new Date(v).toLocaleString()
  if (typeof v === 'string' && v) return v.replace('T', ' ')
  return ''
}

function aqiCategory(aqi: number): string {
  if (aqi <= 50) return '优'
  if (aqi <= 100) return '良'
  if (aqi <= 150) return '轻度污染'
  if (aqi <= 200) return '中度污染'
  if (aqi <= 300) return '重度污染'
  return '严重污染'
}

function popupHtml(layerId: string, props: Record<string, unknown>): string {
  const row = (label: string, value: unknown): string =>
    value === null || value === undefined || value === ''
      ? ''
      : `<div>${label}：${escapeHtml(String(value))}</div>`

  if (layerId === QUAKE_LAYER) {
    return (
      `<div style="font-weight:600;margin-bottom:4px">M${props.mag} 地震</div>` +
      row('位置', props.place) +
      row('深度', props.depth != null ? `${props.depth} km` : null) +
      row('时间', formatTime(props.time))
    )
  }
  if (layerId === FIRE_LAYER) {
    return (
      `<div style="font-weight:600;margin-bottom:4px">火点（VIIRS）</div>` +
      row('辐射功率', props.frp != null ? `${props.frp} MW` : null) +
      row('亮温', props.brightness ? `${props.brightness} K` : null) +
      row('置信度', props.confidence) +
      row('时间', props.acq)
    )
  }
  if (layerId === GDACS_LAYER) {
    const type = GDACS_EVENT_LABELS[String(props.eventtype)] ?? String(props.eventtype)
    return (
      `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(
        String(props.name || type)
      )}</div>` +
      row('类型', type) +
      row('警报级别', props.alertlevel) +
      row('国家/地区', props.country) +
      row('开始', props.fromdate) +
      row('说明', props.description)
    )
  }
  if (layerId === AQI_LAYER) {
    const aqi = Number(props.aqi)
    return (
      `<div style="font-weight:600;margin-bottom:4px">AQI ${aqi} · ${aqiCategory(aqi)}</div>` +
      row('站点', props.name) +
      row('更新时间', props.time)
    )
  }
  const isForecast = props.kind === 'forecast-point'
  const title = `${props.name ?? '台风'}${isForecast ? `（${props.sets || ''}预报）` : ''}`
  return (
    `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(String(title))}</div>` +
    row('强度', props.strong) +
    row('风力', props.power != null ? `${props.power} 级` : null) +
    row('风速', props.speed != null ? `${props.speed} m/s` : null) +
    row('气压', props.pressure != null ? `${props.pressure} hPa` : null) +
    row('移向', props.move_dir) +
    row('移速', props.move_speed != null ? `${props.move_speed} km/h` : null) +
    row('时间', formatTime(props.time))
  )
}

export default function MonitorLayer({ map }: Props) {
  const weather = useMonitorStore((s) => s.weather)
  const gibs = useMonitorStore((s) => s.gibs)
  const earthquakeOn = useMonitorStore((s) => s.earthquakeOn)
  const typhoonOn = useMonitorStore((s) => s.typhoonOn)
  const fireOn = useMonitorStore((s) => s.fireOn)
  const gdacsOn = useMonitorStore((s) => s.gdacsOn)
  const aqiOn = useMonitorStore((s) => s.aqiOn)
  const earthquakes = useMonitorStore((s) => s.earthquakes)
  const typhoons = useMonitorStore((s) => s.typhoons)
  const radarFrames = useMonitorStore((s) => s.radarFrames)
  const radarIndex = useMonitorStore((s) => s.radarIndex)
  const radarPlaying = useMonitorStore((s) => s.radarPlaying)
  const fires = useMonitorStore((s) => s.fires)
  const gdacs = useMonitorStore((s) => s.gdacs)
  const aqi = useMonitorStore((s) => s.aqi)
  const owmKey = useSettingsStore((s) => s.apiKeys.openweather)
  const firmsKey = useSettingsStore((s) => s.apiKeys.firms)
  const waqiKey = useSettingsStore((s) => s.apiKeys.waqi)
  const provider = useMapStore((s) => s.provider)

  const {
    setEarthquakes, setTyphoons, setRadarFrames, advanceRadar, setFires, setGdacs, setAqi, setError,
  } = useMonitorStore.getState()

  // Currently-added raster overlays: id → tile template (to detect URL changes)
  const rasterTilesRef = useRef<Record<string, string>>({})
  const popupRef = useRef<maplibregl.Popup | null>(null)

  // ---------------------------------------------------------------------
  // Data fetching + refresh timers
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!earthquakeOn) {
      setEarthquakes(null)
      return
    }
    let cancelled = false
    const load = () =>
      fetchEarthquakes('all_day')
        .then((fc) => { if (!cancelled) { setEarthquakes(fc); setError(null) } })
        .catch((e) => { if (!cancelled) setError(parseApiError(e)) })
    load()
    const timer = setInterval(load, QUAKE_REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [earthquakeOn]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!typhoonOn) {
      setTyphoons(null)
      return
    }
    let cancelled = false
    const load = () =>
      fetchTyphoons()
        .then((fc) => { if (!cancelled) { setTyphoons(fc); setError(null) } })
        .catch((e) => { if (!cancelled) setError(parseApiError(e)) })
    load()
    const timer = setInterval(load, TYPHOON_REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [typhoonOn]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!weather.radar) {
      setRadarFrames([])
      return
    }
    let cancelled = false
    const load = () =>
      fetchRainviewerFrames()
        .then((frames) => { if (!cancelled) { setRadarFrames(frames); setError(null) } })
        .catch((e) => { if (!cancelled) setError(parseApiError(e)) })
    load()
    const timer = setInterval(load, RADAR_REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [weather.radar]) // eslint-disable-line react-hooks/exhaustive-deps

  // Radar animation loop
  useEffect(() => {
    if (!radarPlaying || radarFrames.length < 2) return
    const timer = setInterval(() => advanceRadar(), 600)
    return () => clearInterval(timer)
  }, [radarPlaying, radarFrames.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fireOn || !firmsKey) {
      setFires(null)
      return
    }
    let cancelled = false
    const load = () =>
      fetchFires(firmsKey)
        .then((fc) => { if (!cancelled) { setFires(fc); setError(null) } })
        .catch((e) => { if (!cancelled) setError(parseApiError(e)) })
    load()
    const timer = setInterval(load, FIRE_REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [fireOn, firmsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gdacsOn) {
      setGdacs(null)
      return
    }
    let cancelled = false
    const load = () =>
      fetchGdacs()
        .then((fc) => { if (!cancelled) { setGdacs(fc); setError(null) } })
        .catch((e) => { if (!cancelled) setError(parseApiError(e)) })
    load()
    const timer = setInterval(load, GDACS_REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [gdacsOn]) // eslint-disable-line react-hooks/exhaustive-deps

  // AQI stations are fetched for the current viewport — refetch after panning
  useEffect(() => {
    if (!aqiOn || !waqiKey || !map) {
      setAqi(null)
      return
    }
    let cancelled = false
    let debounce: ReturnType<typeof setTimeout> | null = null
    const load = () => {
      const b = map.getBounds()
      fetchWaqi(waqiKey, b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
        .then((fc) => { if (!cancelled) { setAqi(fc); setError(null) } })
        .catch((e) => { if (!cancelled) setError(parseApiError(e)) })
    }
    const onMoveEnd = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(load, AQI_MOVE_DEBOUNCE_MS)
    }
    load()
    const timer = setInterval(load, AQI_REFRESH_MS)
    map.on('moveend', onMoveEnd)
    return () => {
      cancelled = true
      clearInterval(timer)
      if (debounce) clearTimeout(debounce)
      map.off('moveend', onMoveEnd)
    }
  }, [aqiOn, waqiKey, map]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------
  // Map layer reconciliation
  // ---------------------------------------------------------------------
  const sync = useCallback(() => {
    if (!map || !map.isStyleLoaded()) return
    const needsGcj02 = provider.startsWith('amap')

    // Raster overlays go below user data / monitor vector layers
    const beforeId = map
      .getStyle()
      .layers.find((l) => l.id.startsWith('user-') || l.id.startsWith('monitor-v-'))?.id

    const setRaster = (
      id: string,
      tiles: string | null,
      opacity: number,
      maxzoom?: number
    ) => {
      const current = rasterTilesRef.current[id]
      if (current && current !== tiles) {
        // Tile URL changed (new radar frame / new key / new date) — rebuild the source
        if (map.getLayer(`${id}-layer`)) map.removeLayer(`${id}-layer`)
        if (map.getSource(id)) map.removeSource(id)
        delete rasterTilesRef.current[id]
      }
      if (!tiles) {
        if (map.getLayer(`${id}-layer`)) map.removeLayer(`${id}-layer`)
        if (map.getSource(id)) map.removeSource(id)
        delete rasterTilesRef.current[id]
        return
      }
      if (!map.getSource(id)) {
        map.addSource(id, {
          type: 'raster',
          tiles: [tiles],
          tileSize: 256,
          ...(maxzoom != null ? { maxzoom } : {}),
        })
      }
      if (!map.getLayer(`${id}-layer`)) {
        map.addLayer(
          { id: `${id}-layer`, type: 'raster', source: id, paint: { 'raster-opacity': opacity } },
          beforeId
        )
      }
      rasterTilesRef.current[id] = tiles
    }

    /** Ensure a geojson source exists with `data`, or remove source+layers when data is null. */
    const setGeojson = (
      sourceId: string,
      layerIds: string[],
      data: GeoJSON.FeatureCollection | null,
      addLayers: () => void
    ) => {
      if (data) {
        const converted = needsGcj02 ? convertToGcj02(data) : data
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'geojson', data: converted })
        } else {
          ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(converted)
        }
        if (!map.getLayer(layerIds[0])) addLayers()
      } else {
        layerIds.forEach((id) => {
          if (map.getLayer(id)) map.removeLayer(id)
        })
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
    }

    // --- Raster overlays (bottom → top: satellite imagery, radar, weather) ---
    for (const key of Object.keys(GIBS_LAYERS) as GibsOverlayKey[]) {
      const def = GIBS_LAYERS[key]
      setRaster(
        `monitor-gibs-${key}`,
        gibs[key] ? getGibsTileTemplate(key) : null,
        key === 'truecolor' ? 1 : 0.85,
        def.maxzoom
      )
    }

    // Radar timeline: one source/layer per frame, only the active frame is
    // visible — switching frames is a paint-property change (no flicker)
    const frames = weather.radar ? radarFrames : []
    Object.keys(rasterTilesRef.current)
      .filter((id) => id.startsWith(`${RADAR_ID}-f`))
      .forEach((id) => {
        const idx = Number(id.slice(`${RADAR_ID}-f`.length))
        if (!frames[idx] || rasterTilesRef.current[id] !== frames[idx].tile_template) {
          if (map.getLayer(`${id}-layer`)) map.removeLayer(`${id}-layer`)
          if (map.getSource(id)) map.removeSource(id)
          delete rasterTilesRef.current[id]
        }
      })
    frames.forEach((frame, i) => {
      const id = `${RADAR_ID}-f${i}`
      if (!map.getSource(id)) {
        map.addSource(id, { type: 'raster', tiles: [frame.tile_template], tileSize: 256 })
      }
      if (!map.getLayer(`${id}-layer`)) {
        map.addLayer(
          { id: `${id}-layer`, type: 'raster', source: id, paint: { 'raster-opacity': 0 } },
          beforeId
        )
      }
      map.setPaintProperty(`${id}-layer`, 'raster-opacity', i === radarIndex ? 0.7 : 0)
      rasterTilesRef.current[id] = frame.tile_template
    })

    // OpenWeatherMap overlays (skipped silently without a key — the dropdown blocks enabling)
    for (const key of Object.keys(OWM_LAYERS) as OwmOverlayKey[]) {
      const active = weather[key] && !!owmKey
      setRaster(`monitor-owm-${key}`, active ? getOwmTileTemplate(OWM_LAYERS[key], owmKey) : null, 0.8)
    }

    // --- Vector overlays ---

    // Wildfires (added first so denser fire points sit under alert/AQI markers)
    setGeojson(FIRE_SOURCE, [FIRE_LAYER], fireOn && firmsKey ? fires : null, () => {
      map.addLayer({
        id: FIRE_LAYER,
        type: 'circle',
        source: FIRE_SOURCE,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['coalesce', ['get', 'frp'], 0],
            0, 2.5, 100, 5, 500, 8,
          ],
          'circle-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'frp'], 0],
            0, '#ffb703', 100, '#fb5607', 500, '#d00000',
          ],
          'circle-opacity': 0.8,
        },
      })
    })

    // Earthquakes
    setGeojson(QUAKE_SOURCE, [QUAKE_LAYER], earthquakeOn ? earthquakes : null, () => {
      map.addLayer({
        id: QUAKE_LAYER,
        type: 'circle',
        source: QUAKE_SOURCE,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'mag'],
            2, 3, 4, 6, 6, 12, 8, 20,
          ],
          'circle-color': [
            'step', ['get', 'mag'],
            '#52c41a', 3, '#fadb14', 4.5, '#fa8c16', 6, '#f5222d',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      })
    })

    // Typhoons
    setGeojson(TY_SOURCE, Object.values(TY_LAYERS), typhoonOn ? typhoons : null, () => {
      map.addLayer({
        id: TY_LAYERS.track,
        type: 'line',
        source: TY_SOURCE,
        filter: ['==', ['get', 'kind'], 'track'],
        paint: { 'line-color': '#eb2f96', 'line-width': 2 },
      })
      map.addLayer({
        id: TY_LAYERS.forecast,
        type: 'line',
        source: TY_SOURCE,
        filter: ['==', ['get', 'kind'], 'forecast'],
        paint: { 'line-color': '#eb2f96', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      })
      map.addLayer({
        id: TY_LAYERS.points,
        type: 'circle',
        source: TY_SOURCE,
        filter: ['==', ['get', 'kind'], 'point'],
        paint: {
          'circle-radius': 4,
          'circle-color': TY_COLOR,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      })
      map.addLayer({
        id: TY_LAYERS.fpoints,
        type: 'circle',
        source: TY_SOURCE,
        filter: ['==', ['get', 'kind'], 'forecast-point'],
        paint: {
          'circle-radius': 3.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': TY_COLOR,
          'circle-stroke-width': 1.5,
        },
      })
      map.addLayer({
        id: TY_LAYERS.label,
        type: 'symbol',
        source: TY_SOURCE,
        filter: ['==', ['get', 'kind'], 'label'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [0.8, 0],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': '#c41d7f',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })
    })

    // GDACS disaster alerts
    setGeojson(GDACS_SOURCE, [GDACS_LAYER, GDACS_LABEL], gdacsOn ? gdacs : null, () => {
      map.addLayer({
        id: GDACS_LAYER,
        type: 'circle',
        source: GDACS_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': GDACS_COLOR,
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })
      map.addLayer({
        id: GDACS_LABEL,
        type: 'symbol',
        source: GDACS_SOURCE,
        layout: {
          'text-field': ['get', 'eventtype'],
          'text-size': 8,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      })
    })

    // WAQI air quality stations
    setGeojson(AQI_SOURCE, [AQI_LAYER, AQI_LABEL], aqiOn && waqiKey ? aqi : null, () => {
      map.addLayer({
        id: AQI_LAYER,
        type: 'circle',
        source: AQI_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': AQI_COLOR,
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      })
      map.addLayer({
        id: AQI_LABEL,
        type: 'symbol',
        source: AQI_SOURCE,
        layout: {
          'text-field': ['to-string', ['get', 'aqi']],
          'text-size': 9,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.35)',
          'text-halo-width': 0.5,
        },
      })
    })

    bringMonitorLayersToTop(map)
  }, [
    map, weather, gibs, earthquakeOn, typhoonOn, fireOn, gdacsOn, aqiOn,
    earthquakes, typhoons, radarFrames, radarIndex, fires, gdacs, aqi,
    owmKey, firmsKey, waqiKey, provider,
  ])

  const syncRef = useRef(sync)
  useEffect(() => { syncRef.current = sync }, [sync])

  // Re-sync whenever relevant state changes
  useEffect(() => {
    if (!map) return
    if (map.isStyleLoaded()) {
      sync()
    } else {
      map.once('styledata', () => syncRef.current())
    }
  }, [map, sync])

  // Re-create everything after a basemap style change (setStyle wipes sources/layers)
  useEffect(() => {
    if (!map) return
    const handleStyleLoad = () => {
      rasterTilesRef.current = {}
      syncRef.current()
    }
    map.on('style.load', handleStyleLoad)
    return () => { map.off('style.load', handleStyleLoad) }
  }, [map])

  // Click → detail popup; hover → pointer cursor (runs after MapCanvas's own handlers)
  useEffect(() => {
    if (!map) return

    const existingPointLayers = () => MONITOR_POINT_LAYERS.filter((id) => map.getLayer(id))

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (useDrawStore.getState().drawMode !== 'off') return
      const layers = existingPointLayers()
      if (!layers.length) return
      const hits = map.queryRenderedFeatures(e.point, { layers })
      if (!hits.length) return
      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:12px;line-height:1.7">${popupHtml(
            hits[0].layer.id,
            (hits[0].properties ?? {}) as Record<string, unknown>
          )}</div>`
        )
        .addTo(map)
    }

    const handleMove = (e: maplibregl.MapMouseEvent) => {
      const layers = existingPointLayers()
      if (!layers.length) return
      const hits = map.queryRenderedFeatures(e.point, { layers })
      if (hits.length) map.getCanvas().style.cursor = 'pointer'
    }

    map.on('click', handleClick)
    map.on('mousemove', handleMove)
    return () => {
      map.off('click', handleClick)
      map.off('mousemove', handleMove)
    }
  }, [map])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      popupRef.current?.remove()
      if (!map) return
      try {
        const style = map.getStyle()
        style?.layers
          .filter((l) => l.id.startsWith('monitor-'))
          .forEach((l) => map.removeLayer(l.id))
        Object.keys(style?.sources ?? {})
          .filter((id) => id.startsWith('monitor-'))
          .forEach((id) => map.removeSource(id))
      } catch {
        /* map may already be destroyed */
      }
    }
  }, [map])

  return null
}
