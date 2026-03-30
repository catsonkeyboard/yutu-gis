import { create } from 'zustand'

export interface Layer {
  id: string
  name: string
  type: 'geojson' | 'raster' | 'image'
  source: object
  visible: boolean
  opacity: number
}

interface LayerState {
  layers: Layer[]
  selectedLayerId: string | null
  selectedFeatureProps: Record<string, unknown> | null
  addLayer: (layer: Layer) => void
  removeLayer: (id: string) => void
  toggleVisible: (id: string) => void
  setOpacity: (id: string, opacity: number) => void
  setSelectedLayer: (id: string | null) => void
  setSelectedFeatureProps: (props: Record<string, unknown> | null) => void
  appendFeatures: (id: string, features: GeoJSON.Feature[]) => void
  reorder: (layers: Layer[]) => void
  reset: () => void
}

export const useLayerStore = create<LayerState>((set) => ({
  layers: [],
  selectedLayerId: null,
  selectedFeatureProps: null,
  addLayer: (layer) => set((s) => ({ layers: [layer, ...s.layers] })),
  removeLayer: (id) =>
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
      selectedFeatureProps: s.selectedLayerId === id ? null : s.selectedFeatureProps,
    })),
  toggleVisible: (id) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) })),
  setOpacity: (id, opacity) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)) })),
  setSelectedLayer: (id) => set({ selectedLayerId: id, selectedFeatureProps: null }),
  setSelectedFeatureProps: (props) => set({ selectedFeatureProps: props }),
  appendFeatures: (id, newFeatures) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id || l.type !== 'geojson') return l
        const existing = l.source as GeoJSON.FeatureCollection
        return { ...l, source: { ...existing, features: [...existing.features, ...newFeatures] } }
      }),
    })),
  reorder: (layers) => set({ layers }),
  reset: () => set({ layers: [], selectedLayerId: null }),
}))
