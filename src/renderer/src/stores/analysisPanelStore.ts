import { create } from 'zustand'

interface AnalysisPanelState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useAnalysisPanelStore = create<AnalysisPanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
