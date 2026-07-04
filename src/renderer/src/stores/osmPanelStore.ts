import { create } from 'zustand'
import type { MapBbox } from '../hooks/useMapBboxSelect'

interface OsmPanelState {
  open: boolean
  bbox: MapBbox | null
  selecting: boolean
  /** See tilesPanelStore.selectEndAt — suppresses the post-drag click. */
  selectEndAt: number
  setOpen: (open: boolean) => void
  setBbox: (bbox: MapBbox | null) => void
  setSelecting: (selecting: boolean) => void
}

export const useOsmPanelStore = create<OsmPanelState>((set) => ({
  open: false,
  bbox: null,
  selecting: false,
  selectEndAt: 0,
  setOpen: (open) => set(open ? { open } : { open, selecting: false }),
  setBbox: (bbox) => set({ bbox }),
  setSelecting: (selecting) =>
    set(selecting ? { selecting } : { selecting, selectEndAt: Date.now() }),
}))
