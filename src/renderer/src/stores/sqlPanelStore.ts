import { create } from 'zustand'

const HISTORY_MAX = 20

interface SqlPanelState {
  open: boolean
  height: number
  /** Editor text survives closing the panel (session only). */
  sql: string
  /** Recently executed queries, newest first (session only). */
  history: string[]
  setOpen: (open: boolean) => void
  setHeight: (height: number) => void
  setSql: (sql: string) => void
  pushHistory: (sql: string) => void
}

export const useSqlPanelStore = create<SqlPanelState>((set) => ({
  open: false,
  height: 300,
  sql: '',
  history: [],
  setOpen: (open) => set({ open }),
  setHeight: (height) => set({ height: Math.max(220, Math.min(600, height)) }),
  setSql: (sql) => set({ sql }),
  pushHistory: (sql) =>
    set((s) => {
      const trimmed = sql.trim()
      if (!trimmed || s.history[0] === trimmed) return s
      return { history: [trimmed, ...s.history.filter((h) => h !== trimmed)].slice(0, HISTORY_MAX) }
    }),
}))
