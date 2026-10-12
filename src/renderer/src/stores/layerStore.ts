import { create } from 'zustand'

export interface LayerStyle {
  mode: 'single' | 'categorized' | 'graduated' | 'cluster' | 'heatmap'
  fillColor: string
  strokeColor: string
  strokeWidth: number
  pointRadius: number
  fillOpacity: number
  field?: string
  categories?: { value: string; color: string }[]
  breaks?: { max: number | null; color: string }[]
  fallbackColor?: string
  rampName?: string
  /** Text label by attribute (independent of the symbology mode). */
  labelField?: string
  labelSize?: number
  labelColor?: string
  /** cluster mode */
  clusterRadius?: number
  /** heatmap mode */
  heatRadius?: number
}

export interface Layer {
  id: string
  name: string
  type: 'geojson' | 'raster' | 'image'
  source: object
  visible: boolean
  opacity: number
  /** Custom symbology; undefined = default rendering (blue + orange selection). */
  style?: LayerStyle
  /** Absolute path of the source file for path-backed layers (offline maps, GeoTIFF). */
  sourcePath?: string
  /** Stamp from a global monotonic counter, bumped on every source mutation;
   *  SQL layer sync uses it to skip re-registering unchanged layers. */
  sourceVersion?: number
  /** Sidecar-backed layer whose data is not in memory yet (hidden layer from
   *  a v2 project); fetched on first make-visible. See services/project.ts. */
  lazy?: { path: string }
  /** Content-addressed layer-store hash of the source bytes (server-side
   *  copy); any renderer-side mutation invalidates it (cleared). */
  contentHash?: string
}

interface LayerState {
  layers: Layer[]
  selectedLayerId: string | null
  selectedFeatureProps: Record<string, unknown> | null
  addLayer: (layer: Layer) => void
  removeLayer: (id: string) => void
  toggleVisible: (id: string) => void
  setOpacity: (id: string, opacity: number) => void
  setStyle: (id: string, style: LayerStyle | undefined) => void
  rename: (id: string, name: string) => void
  /** Replace a layer's data wholesale (field calculator etc.). */
  setSource: (id: string, source: object, contentHash?: string) => void
  /** Drop the lazy marker after the sidecar data has been loaded. */
  clearLazy: (id: string) => void
  setSelectedLayer: (id: string | null) => void
  setSelectedFeatureProps: (props: Record<string, unknown> | null) => void
  appendFeatures: (id: string, features: GeoJSON.Feature[]) => void
  reorder: (layers: Layer[]) => void
  reset: () => void
}

/** Global monotonic counter — a removed-and-re-added layer always gets a fresh
 *  version, so it can never collide with a stale server-side record. */
let sourceVersionSeq = 0

export const useLayerStore = create<LayerState>((set) => ({
  layers: [],
  selectedLayerId: null,
  selectedFeatureProps: null,
  addLayer: (layer) =>
    set((s) => ({ layers: [{ ...layer, sourceVersion: layer.sourceVersion ?? ++sourceVersionSeq }, ...s.layers] })),
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
  setStyle: (id, style) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, style } : l)) })),
  rename: (id, name) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, name } : l)) })),
  setSource: (id, source, contentHash) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, source, contentHash, sourceVersion: ++sourceVersionSeq } : l
      ),
    })),
  setSelectedLayer: (id) => set({ selectedLayerId: id, selectedFeatureProps: null }),
  setSelectedFeatureProps: (props) => set({ selectedFeatureProps: props }),
  clearLazy: (id) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, lazy: undefined } : l)) })),
  appendFeatures: (id, newFeatures) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id || l.type !== 'geojson') return l
        const existing = l.source as GeoJSON.FeatureCollection
        return {
          ...l,
          source: { ...existing, features: [...existing.features, ...newFeatures] },
          sourceVersion: ++sourceVersionSeq,
          // appended features are renderer-made — the stored hash no longer matches
          contentHash: undefined,
        }
      }),
    })),
  reorder: (layers) => set({ layers }),
  reset: () => set({ layers: [], selectedLayerId: null }),
}))
