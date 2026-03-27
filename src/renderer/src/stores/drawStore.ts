import { create } from 'zustand'

export type DrawMode = 'off' | 'point' | 'line' | 'polygon'

interface DrawState {
  drawMode: DrawMode
  features: GeoJSON.Feature[]
  setMode: (mode: DrawMode) => void
  setFeatures: (features: GeoJSON.Feature[]) => void
  clear: () => void
}

export const useDrawStore = create<DrawState>((set) => ({
  drawMode: 'off',
  features: [],
  setMode: (drawMode) => set({ drawMode }),
  setFeatures: (features) => set({ features }),
  clear: () => set({ drawMode: 'off', features: [] }),
}))
