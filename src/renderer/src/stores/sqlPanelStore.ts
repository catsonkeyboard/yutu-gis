import { create } from 'zustand'

interface SqlPanelState {
  open: boolean
  height: number
  /** Editor text survives closing the panel (session only). */
  sql: string
  setOpen: (open: boolean) => void
  setHeight: (height: number) => void
  setSql: (sql: string) => void
}

export const useSqlPanelStore = create<SqlPanelState>((set) => ({
  open: false,
  height: 300,
  sql: '',
  setOpen: (open) => set({ open }),
  setHeight: (height) => set({ height: Math.max(220, Math.min(600, height)) }),
  setSql: (sql) => set({ sql }),
}))
