import { create } from 'zustand'

export type MapProvider =
  | 'osm'
  | 'google-street'
  | 'google-satellite'
  | 'amap-street'
  | 'amap-satellite'
  | 'amap-terrain'

interface FitBoundsRequest {
  bounds: [[number, number], [number, number]]
  timestamp: number
}

interface MapState {
  center: [number, number]
  zoom: number
  rotation: number
  provider: MapProvider
  fitBoundsRequest: FitBoundsRequest | null
  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void
  setRotation: (rotation: number) => void
  setProvider: (provider: MapProvider) => void
  requestFitBounds: (bounds: [[number, number], [number, number]]) => void
  reset: () => void
}

const DEFAULT = {
  center: [116.3974, 39.9093] as [number, number],
  zoom: 4,
  rotation: 0,
  provider: 'osm' as MapProvider,
  fitBoundsRequest: null as FitBoundsRequest | null,
}

export const useMapStore = create<MapState>((set) => ({
  ...DEFAULT,
  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  setRotation: (rotation) => set({ rotation }),
  setProvider: (provider) => set({ provider }),
  requestFitBounds: (bounds) => set({ fitBoundsRequest: { bounds, timestamp: Date.now() } }),
  reset: () => set(DEFAULT),
}))
