import { create } from 'zustand'
import type { RowFilter } from '../components/AttributeTable/tableUtils'

interface AttributeTableState {
  open: boolean
  height: number
  filter: RowFilter | null
  setOpen: (open: boolean) => void
  setHeight: (height: number) => void
  setFilter: (filter: RowFilter | null) => void
}

export const useAttributeTableStore = create<AttributeTableState>((set) => ({
  open: false,
  height: 260,
  filter: null,
  setOpen: (open) => set({ open }),
  setHeight: (height) => set({ height: Math.max(180, Math.min(500, height)) }),
  setFilter: (filter) => set({ filter }),
}))
