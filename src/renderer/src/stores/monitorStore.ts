import { create } from 'zustand'
import type { RadarFrame, GibsOverlayKey } from '../services/api'

/** Weather overlay keys — 'radar' is RainViewer (no key), the rest are OpenWeatherMap tiles. */
export type WeatherOverlayKey = 'radar' | 'precipitation' | 'temp' | 'clouds' | 'wind' | 'pressure'

export type OwmOverlayKey = Exclude<WeatherOverlayKey, 'radar'>

export type { GibsOverlayKey }

/** Map our overlay keys to OpenWeatherMap tile layer names. */
export const OWM_LAYERS: Record<OwmOverlayKey, string> = {
  precipitation: 'precipitation_new',
  temp: 'temp_new',
  clouds: 'clouds_new',
  wind: 'wind_new',
  pressure: 'pressure_new',
}

interface MonitorStoreState {
  /** Which weather raster overlays are enabled */
  weather: Record<WeatherOverlayKey, boolean>
  /** Which NASA GIBS satellite imagery overlays are enabled */
  gibs: Record<GibsOverlayKey, boolean>
  /** Earthquake point layer enabled */
  earthquakeOn: boolean
  /** Typhoon track layer enabled */
  typhoonOn: boolean
  /** NASA FIRMS wildfire layer enabled */
  fireOn: boolean
  /** GDACS disaster alert layer enabled */
  gdacsOn: boolean
  /** WAQI air-quality layer enabled */
  aqiOn: boolean

  /** Fetched data (runtime cache) */
  earthquakes: GeoJSON.FeatureCollection | null
  typhoons: GeoJSON.FeatureCollection | null
  /** Radar animation timeline (past + short-term forecast frames) */
  radarFrames: RadarFrame[]
  radarIndex: number
  radarPlaying: boolean
  fires: GeoJSON.FeatureCollection | null
  gdacs: GeoJSON.FeatureCollection | null
  aqi: GeoJSON.FeatureCollection | null

  /** Last error from any monitor fetch (shown in the dropdown panel) */
  error: string | null

  toggleWeather: (key: WeatherOverlayKey) => void
  toggleGibs: (key: GibsOverlayKey) => void
  setEarthquakeOn: (v: boolean) => void
  setTyphoonOn: (v: boolean) => void
  setFireOn: (v: boolean) => void
  setGdacsOn: (v: boolean) => void
  setAqiOn: (v: boolean) => void
  setEarthquakes: (fc: GeoJSON.FeatureCollection | null) => void
  setTyphoons: (fc: GeoJSON.FeatureCollection | null) => void
  /** Replace the frame list; resets the index to the last live (non-forecast) frame. */
  setRadarFrames: (frames: RadarFrame[]) => void
  setRadarIndex: (index: number) => void
  setRadarPlaying: (playing: boolean) => void
  /** Advance to the next frame (wraps around). */
  advanceRadar: () => void
  setFires: (fc: GeoJSON.FeatureCollection | null) => void
  setGdacs: (fc: GeoJSON.FeatureCollection | null) => void
  setAqi: (fc: GeoJSON.FeatureCollection | null) => void
  setError: (msg: string | null) => void
}

export const useMonitorStore = create<MonitorStoreState>((set) => ({
  weather: {
    radar: false,
    precipitation: false,
    temp: false,
    clouds: false,
    wind: false,
    pressure: false,
  },
  gibs: {
    truecolor: false,
    sst: false,
    nightlights: false,
  },
  earthquakeOn: false,
  typhoonOn: false,
  fireOn: false,
  gdacsOn: false,
  aqiOn: false,
  earthquakes: null,
  typhoons: null,
  radarFrames: [],
  radarIndex: 0,
  radarPlaying: false,
  fires: null,
  gdacs: null,
  aqi: null,
  error: null,

  toggleWeather: (key) =>
    set((s) => ({ weather: { ...s.weather, [key]: !s.weather[key] } })),
  toggleGibs: (key) =>
    set((s) => ({ gibs: { ...s.gibs, [key]: !s.gibs[key] } })),
  setEarthquakeOn: (earthquakeOn) => set({ earthquakeOn }),
  setTyphoonOn: (typhoonOn) => set({ typhoonOn }),
  setFireOn: (fireOn) => set({ fireOn }),
  setGdacsOn: (gdacsOn) => set({ gdacsOn }),
  setAqiOn: (aqiOn) => set({ aqiOn }),
  setEarthquakes: (earthquakes) => set({ earthquakes }),
  setTyphoons: (typhoons) => set({ typhoons }),
  setRadarFrames: (radarFrames) => {
    let lastLive = radarFrames.length - 1
    while (lastLive > 0 && radarFrames[lastLive].nowcast) lastLive--
    set({ radarFrames, radarIndex: Math.max(0, lastLive), radarPlaying: false })
  },
  setRadarIndex: (radarIndex) => set({ radarIndex }),
  setRadarPlaying: (radarPlaying) => set({ radarPlaying }),
  advanceRadar: () =>
    set((s) => ({
      radarIndex: s.radarFrames.length ? (s.radarIndex + 1) % s.radarFrames.length : 0,
    })),
  setFires: (fires) => set({ fires }),
  setGdacs: (gdacs) => set({ gdacs }),
  setAqi: (aqi) => set({ aqi }),
  setError: (error) => set({ error }),
}))

/** True when any monitor overlay is enabled (drives the toolbar badge). */
export function isMonitorActive(s: {
  weather: Record<WeatherOverlayKey, boolean>
  gibs: Record<GibsOverlayKey, boolean>
  earthquakeOn: boolean
  typhoonOn: boolean
  fireOn: boolean
  gdacsOn: boolean
  aqiOn: boolean
}): boolean {
  return (
    s.earthquakeOn ||
    s.typhoonOn ||
    s.fireOn ||
    s.gdacsOn ||
    s.aqiOn ||
    Object.values(s.weather).some(Boolean) ||
    Object.values(s.gibs).some(Boolean)
  )
}
