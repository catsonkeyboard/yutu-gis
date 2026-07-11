import { create } from 'zustand'

interface SwipeState {
  enabled: boolean
  layerId: string | null
  /** Divider position, 0–1 fraction of the map width (right side shows the swipe layer). */
  position: number
  setEnabled: (enabled: boolean) => void
  setLayer: (layerId: string | null) => void
  setPosition: (position: number) => void
}

export const useSwipeStore = create<SwipeState>((set) => ({
  enabled: false,
  layerId: null,
  position: 0.5,
  setEnabled: (enabled) => set({ enabled }),
  setLayer: (layerId) => set({ layerId }),
  setPosition: (position) => set({ position: Math.max(0.05, Math.min(0.95, position)) }),
}))
