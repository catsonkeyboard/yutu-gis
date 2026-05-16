import { create } from 'zustand'

export type FlightDataSource = 'opensky' | 'adsbfi'

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
}

export interface AdsbfiConfig {
  /** no config needed — open API */
}

interface FlightStoreState {
  /** Whether flight tracking is actively polling */
  active: boolean
  /** Which data source is active */
  dataSource: FlightDataSource
  /** Polling interval in seconds (min 5 for adsbfi, min 10 for opensky) */
  pollInterval: number
  /** OpenSky OAuth2 config */
  openSkyConfig: OpenSkyConfig
  /** adsb.fi config (currently empty, reserved) */
  adsbfiConfig: AdsbfiConfig
  /** Access token (OpenSky only, managed internally) */
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
  setDataSource: (ds: FlightDataSource) => void
  setPollInterval: (interval: number) => void
  setOpenSkyConfig: (config: OpenSkyConfig) => void
  setAdsbfiConfig: (config: AdsbfiConfig) => void
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
  dataSource: 'adsbfi',
  pollInterval: 10,
  openSkyConfig: { clientId: '', clientSecret: '' },
  adsbfiConfig: {},
  accessToken: null,
  tokenExpiresAt: null,
  flights: {},
  lastUpdate: null,
  error: null,
  fetching: false,

  setActive: (active) => set({ active }),
  setDataSource: (dataSource) => set({ dataSource }),
  setPollInterval: (pollInterval) => set({ pollInterval }),
  setOpenSkyConfig: (openSkyConfig) => set({ openSkyConfig }),
  setAdsbfiConfig: (adsbfiConfig) => set({ adsbfiConfig }),
  setToken: (token, expiresIn) =>
    set({
      accessToken: token,
      tokenExpiresAt: Date.now() + (expiresIn - 30) * 1000,
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
