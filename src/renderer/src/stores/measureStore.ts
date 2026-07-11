import { create } from 'zustand'
import { pathLength, sphericalArea } from '../utils/geodesy'

export type MeasureMode = 'off' | 'distance' | 'area'

export interface CompletedMeasure {
  kind: 'distance' | 'area'
  coords: [number, number][]
  value: number // meters or m²
}

interface MeasureState {
  mode: MeasureMode
  /** Vertices of the in-progress segment (always WGS-84). */
  vertices: [number, number][]
  completed: CompletedMeasure[]
  setMode: (mode: MeasureMode) => void
  addVertex: (coord: [number, number]) => void
  undoVertex: () => void
  finishSegment: () => void
  clearAll: () => void
}

function dedupeConsecutive(coords: [number, number][]): [number, number][] {
  return coords.filter(
    (c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]
  )
}

export const useMeasureStore = create<MeasureState>((set, get) => ({
  mode: 'off',
  vertices: [],
  completed: [],
  setMode: (mode) => set({ mode, vertices: [], completed: [] }),
  addVertex: (coord) => set((s) => ({ vertices: [...s.vertices, coord] })),
  undoVertex: () => set((s) => ({ vertices: s.vertices.slice(0, -1) })),
  finishSegment: () => {
    const { mode, vertices } = get()
    const coords = dedupeConsecutive(vertices)
    if (mode === 'off') return
    const minPoints = mode === 'distance' ? 2 : 3
    if (coords.length < minPoints) {
      set({ vertices: [] })
      return
    }
    const value = mode === 'distance' ? pathLength(coords) : sphericalArea(coords)
    set((s) => ({
      vertices: [],
      completed: [...s.completed, { kind: mode as 'distance' | 'area', coords, value }],
    }))
  },
  clearAll: () => set({ vertices: [], completed: [] }),
}))
