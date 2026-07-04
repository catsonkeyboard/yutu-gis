import { create } from 'zustand'

export type TilesBbox = [number, number, number, number] // [south, west, north, east]

interface TilesPanelState {
  open: boolean
  bbox: TilesBbox | null
  /** Rectangle drag-selection mode on the map */
  selecting: boolean
  /** Timestamp of the last drag-selection end — lets the map click handler
   *  ignore the click event synthesized right after the selection mouseup. */
  selectEndAt: number
  setOpen: (open: boolean) => void
  setBbox: (bbox: TilesBbox | null) => void
  setSelecting: (selecting: boolean) => void
}

export const useTilesPanelStore = create<TilesPanelState>((set) => ({
  open: false,
  bbox: null,
  selecting: false,
  selectEndAt: 0,
  setOpen: (open) => set(open ? { open } : { open, selecting: false }),
  setBbox: (bbox) => set({ bbox }),
  setSelecting: (selecting) =>
    set(selecting ? { selecting } : { selecting, selectEndAt: Date.now() }),
}))
