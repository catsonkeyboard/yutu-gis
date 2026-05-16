import { create } from 'zustand'

export interface FlightState {
  icao24: string
  callsign: string | null
  originCountry: string
  longitude: number | null
  latitude: number | null
  baroAltitude: number | null
  onGround: boolean
  velocity: number | null
  trueTrack: number | null
  verticalRate: number | null
  geoAltitude: number | null
  squawk: string | null
  category: number
}

export interface OpenSkyConfig {
  clientId: string
  clientSecret: string
  /** Polling interval in seconds (min 10) */
  pollInterval: number
}

interface FlightStoreState {
  /** Whether flight tracking is actively polling */
  active: boolean
  /** OAuth2 config */
  config: OpenSkyConfig
  /** Access token (managed internally) */
  accessToken: string | null
  tokenExpiresAt: number | null
  /** Current aircraft in view */
  flights: Record<string, FlightState>
  /** Last fetch timestamp */
  lastUpdate: number | null
  /** Error message if any */
  error: string | null
  /** Whether currently fetching */
  fetching: boolean

  setActive: (v: boolean) => void
  setConfig: (config: OpenSkyConfig) => void
  setToken: (token: string, expiresIn: number) => void
  clearToken: () => void
  setFlights: (flights: Record<string, FlightState>) => void
  setLastUpdate: (ts: number) => void
  setError: (msg: string | null) => void
  setFetching: (v: boolean) => void
  clear: () => void
}

export const useFlightStore = create<FlightStoreState>((set) => ({
  active: false,
  config: { clientId: '', clientSecret: '', pollInterval: 15 },
  accessToken: null,
  tokenExpiresAt: null,
  flights: {},
  lastUpdate: null,
  error: null,
  fetching: false,

  setActive: (active) => set({ active }),
  setConfig: (config) => set({ config }),
  setToken: (token, expiresIn) =>
    set({
      accessToken: token,
      tokenExpiresAt: Date.now() + (expiresIn - 30) * 1000, // 30s margin
    }),
  clearToken: () => set({ accessToken: null, tokenExpiresAt: null }),
  setFlights: (flights) => set({ flights }),
  setLastUpdate: (ts) => set({ lastUpdate: ts }),
  setError: (error) => set({ error }),
  setFetching: (fetching) => set({ fetching }),
  clear: () =>
    set({
      active: false,
      flights: {},
      lastUpdate: null,
      error: null,
      fetching: false,
    }),
}))
