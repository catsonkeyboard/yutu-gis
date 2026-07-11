import { create } from 'zustand'

interface StylePanelState {
  open: boolean
  layerId: string | null
  openFor: (layerId: string) => void
  close: () => void
}

export const useStylePanelStore = create<StylePanelState>((set) => ({
  open: false,
  layerId: null,
  openFor: (layerId) => set({ open: true, layerId }),
  close: () => set({ open: false, layerId: null }),
}))
