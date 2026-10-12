import { useLayerStore, type Layer, type LayerStyle } from '../stores/layerStore'
import { useMapStore, type MapProvider } from '../stores/mapStore'
import {
  registerTileSource,
  getTileSourceUrlTemplate,
  registerGeoTiff,
  getGeoTiffUrlTemplate,
  saveProjectFile,
  readProjectFile,
  cleanupProjectFiles,
  copyProjectFile,
} from './api'

export const PROJECT_VERSION = 2

/** Geojson layers above this feature count are stored as sidecar files
 *  (referenced by filename) instead of inline JSON in the .yutugis file. */
export const INLINE_FEATURE_MAX = 2000

/** Features per chunk when serializing a big layer — yield to the UI between chunks. */
const SERIALIZE_CHUNK = 2000

/** Max concurrent sidecar fetches when loading a project. */
const LOAD_CONCURRENCY = 4

interface ProjectGeojsonLayer {
  kind: 'geojson'
  id: string
  name: string
  visible: boolean
  opacity: number
  style?: LayerStyle
  /** Inline source (small layers). Mutually exclusive with sourceFile. */
  source?: GeoJSON.FeatureCollection
  /** Sidecar filename within filesDir (large layers). */
  sourceFile?: string
}

interface ProjectRasterLayer {
  kind: 'raster'
  id: string
  name: string
  visible: boolean
  opacity: number
  path: string
}

export interface ProjectFile {
  app: 'yutugis-project'
  version: number
  savedAt: string
  map: { center: [number, number]; zoom: number; provider: MapProvider }
  /** Sidecar directory name, relative to the project file's directory. */
  filesDir?: string
  layers: (ProjectGeojsonLayer | ProjectRasterLayer)[]
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

// Incremental-save bookkeeping: which layer sourceVersions were already
// written to which project path. Re-seeded by loadProject / saveProject.
let lastSavedPath: string | null = null
const lastSavedVersions = new Map<string, number>()

/** Parent directory of a POSIX path ('' for bare filenames). */
function dirName(filePath: string): string {
  return filePath.split('/').slice(0, -1).join('/')
}

/** Layers that must live in a sidecar file: too big to inline, or lazy
 *  (sidecar data never fetched into memory — e.g. a hidden layer from a
 *  freshly loaded project whose source is still an empty placeholder). */
function isSidecarLayer(l: Layer): boolean {
  if (l.type !== 'geojson') return false
  if (l.lazy) return true
  const fc = l.source as GeoJSON.FeatureCollection
  return (fc?.features?.length ?? 0) > INLINE_FEATURE_MAX
}

interface BuildResult {
  project: ProjectFile
  /** Absolute sidecar dir (null when no sidecar layers) and referenced filenames. */
  sidecarDir: string | null
  keep: string[]
}

function buildProject(projectPath?: string): BuildResult {
  const { layers } = useLayerStore.getState()
  const { center, zoom, provider } = useMapStore.getState()

  const projectLayers: (ProjectGeojsonLayer | ProjectRasterLayer)[] = []
  const keep: string[] = []
  let anySidecar = false

  for (const l of layers) {
    if (l.type === 'geojson') {
      const file = `${l.id}.geojson`
      const sidecar = isSidecarLayer(l)
      if (sidecar) {
        anySidecar = true
        keep.push(file)
      }
      projectLayers.push({
        kind: 'geojson',
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        ...(l.style ? { style: l.style } : {}),
        ...(sidecar ? { sourceFile: file } : { source: l.source as GeoJSON.FeatureCollection }),
      })
    } else if (l.type === 'raster' && l.sourcePath) {
      projectLayers.push({
        kind: 'raster',
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        path: l.sourcePath,
      })
    }
    // raster layers without a sourcePath cannot be restored — dropped on save
  }

  // filesDir derives from the project filename: "/x/demo.yutugis" → "/x/demo.files"
  const base = projectPath?.split('/').pop() ?? ''
  const stem = base.replace(/\.yutugis$/i, '') || 'project'
  const filesDir = projectPath && anySidecar ? `${stem}.files` : undefined

  return {
    project: {
      app: 'yutugis-project',
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      map: { center, zoom, provider },
      ...(filesDir ? { filesDir } : {}),
      layers: projectLayers,
    },
    sidecarDir: projectPath && filesDir ? `${dirName(projectPath)}/${filesDir}` : null,
    keep,
  }
}

/** Snapshot the current workspace as a project object (metadata only for
 *  sidecar layers — pass projectPath to emit filesDir). */
export function serializeProject(projectPath?: string): ProjectFile {
  return buildProject(projectPath).project
}

/** Serialize a FeatureCollection to a Blob in chunks, yielding to the UI
 *  between chunks so a 100k-feature layer never blocks the main thread.
 *  Output is byte-identical to JSON.stringify for plain feature collections. */
export async function fcToBlob(fc: GeoJSON.FeatureCollection): Promise<Blob> {
  const parts: string[] = ['{"type":"FeatureCollection","features":[']
  for (let i = 0; i < fc.features.length; i++) {
    if (i > 0) parts.push(',')
    parts.push(JSON.stringify(fc.features[i]))
    if (i % SERIALIZE_CHUNK === SERIALIZE_CHUNK - 1) {
      // Yield to the UI between chunks
      const { promise, resolve } = Promise.withResolvers<void>()
      setTimeout(resolve, 0)
      // eslint-disable-next-line no-await-in-loop
      await promise
    }
  }
  parts.push(']}')
  return new Blob(parts, { type: 'application/json' })
}

/** Save the workspace to `filePath`. Large/changed geojson layers are written
 *  to sidecar files first (atomic), then the small metadata file, then orphan
 *  cleanup — the metadata never references a file that was not written. */
export async function saveProject(filePath: string): Promise<void> {
  const layers = useLayerStore.getState().layers
  const { project, sidecarDir, keep } = buildProject(filePath)

  if (sidecarDir) {
    const samePath = lastSavedPath === filePath
    const keepSet = new Set(keep)
    for (const l of layers) {
      if (l.type !== 'geojson' || l.lazy || !keepSet.has(`${l.id}.geojson`)) continue
      if (samePath && lastSavedVersions.get(l.id) === l.sourceVersion) continue
      // Prefer a server-side copy from the content-addressed store — the
      // renderer ships zero bytes; fall back to chunked upload on miss.
      const dest = `${sidecarDir}/${l.id}.geojson`
      if (l.contentHash) {
        // eslint-disable-next-line no-await-in-loop
        const copied = await copyProjectFile(dest, l.contentHash).then(
          () => true,
          () => false
        )
        if (copied) continue
      }
      // eslint-disable-next-line no-await-in-loop
      const blob = await fcToBlob(l.source as GeoJSON.FeatureCollection)
      // eslint-disable-next-line no-await-in-loop
      await saveProjectFile(dest, blob)
    }
  }

  await window.electronAPI.writeFile(filePath, JSON.stringify(project))

  if (sidecarDir) {
    await cleanupProjectFiles(sidecarDir, keep).catch(console.error)
  }
  lastSavedPath = filePath
  for (const l of layers) {
    if (l.sourceVersion !== undefined) lastSavedVersions.set(l.id, l.sourceVersion)
  }
}

/**
 * Replace the current workspace with a saved project.
 * Visible sidecar layers are fetched up front (bounded concurrency); hidden
 * ones become lazy placeholders — see loadLazyLayers.
 * Returns warnings for layers that could not be restored.
 * Throws on invalid/newer project files.
 */
export async function loadProject(
  json: unknown,
  projectPath?: string
): Promise<{ warnings: string[] }> {
  const project = json as ProjectFile
  if (!project || project.app !== 'yutugis-project' || !Array.isArray(project.layers)) {
    throw new Error('不是有效的舆图工程文件')
  }
  if (typeof project.version !== 'number' || project.version > PROJECT_VERSION) {
    throw new Error('工程文件版本过新，请升级应用后打开')
  }

  const warnings: string[] = []
  const restored: Layer[] = []

  const sidecarPath = (fileName: string): string | null => {
    if (!projectPath || !project.filesDir) return null
    return `${dirName(projectPath)}/${project.filesDir}/${fileName}`
  }

  // Pass 1: fetch visible sidecar layers with bounded concurrency.
  // Hidden ones stay lazy; failures below become warnings and are skipped.
  const toFetch = project.layers.filter(
    (pl): pl is ProjectGeojsonLayer => pl.kind === 'geojson' && !!pl.sourceFile && pl.visible
  )
  const fetched = new Map<string, GeoJSON.FeatureCollection>()
  const fetchFailed = new Set<string>()
  if (toFetch.length && projectPath && project.filesDir) {
    const queue = toFetch.map((pl) => ({ pl, path: sidecarPath(pl.sourceFile!)! }))
    const worker = async (): Promise<void> => {
      for (;;) {
        const item = queue.shift()
        if (!item) return
        try {
          // eslint-disable-next-line no-await-in-loop
          fetched.set(item.pl.id, await readProjectFile(item.path))
        } catch {
          fetchFailed.add(item.pl.id)
          warnings.push(`图层「${item.pl.name}」无法恢复（${item.path}）`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, worker))
  }

  // Pass 2: build the restored list strictly in project order
  for (const pl of project.layers) {
    if (pl.kind === 'geojson') {
      if (pl.sourceFile) {
        const path = sidecarPath(pl.sourceFile)
        if (!path) {
          warnings.push(`图层「${pl.name}」无法恢复（缺少工程路径或侧车目录信息）`)
          continue
        }
        if (pl.visible) {
          const fc = fetched.get(pl.id)
          if (!fc) {
            if (!fetchFailed.has(pl.id)) warnings.push(`图层「${pl.name}」无法恢复（${path}）`)
            continue
          }
          restored.push({
            id: pl.id,
            name: pl.name,
            type: 'geojson',
            source: fc,
            visible: pl.visible,
            opacity: pl.opacity,
            ...(pl.style ? { style: pl.style } : {}),
            sourcePath: path,
          })
        } else {
          // Hidden layer: empty placeholder, data fetched on first make-visible
          restored.push({
            id: pl.id,
            name: pl.name,
            type: 'geojson',
            source: EMPTY_FC,
            visible: false,
            opacity: pl.opacity,
            ...(pl.style ? { style: pl.style } : {}),
            sourcePath: path,
            lazy: { path },
          })
        }
      } else if (pl.source) {
        restored.push({
          id: pl.id,
          name: pl.name,
          type: 'geojson',
          source: pl.source,
          visible: pl.visible,
          opacity: pl.opacity,
          ...(pl.style ? { style: pl.style } : {}),
        })
      } else {
        warnings.push(`图层「${pl.name}」数据缺失`)
      }
    } else if (pl.kind === 'raster') {
      try {
        // GeoTIFF imagery and offline maps (MBTiles/tile dirs) re-register
        // through different endpoints — dispatch by file extension
        const source = /\.tiff?$/i.test(pl.path)
          ? await registerGeoTiff(pl.path).then((info) => ({
              tiles: [getGeoTiffUrlTemplate(info.id)],
              bounds: info.bounds as [number, number, number, number] | undefined,
              minzoom: info.minzoom,
              maxzoom: info.maxzoom,
            }))
          : await registerTileSource(pl.path).then((info) => ({
              tiles: [getTileSourceUrlTemplate(info.source_id)],
              bounds: info.bounds ?? undefined,
              minzoom: info.minzoom,
              maxzoom: info.maxzoom,
            }))
        restored.push({
          id: pl.id,
          name: pl.name,
          type: 'raster',
          sourcePath: pl.path,
          source,
          visible: pl.visible,
          opacity: pl.opacity,
        })
      } catch {
        warnings.push(`栅格图层「${pl.name}」无法恢复（${pl.path}）`)
      }
    }
  }

  const layerStore = useLayerStore.getState()
  layerStore.reset()
  // addLayer prepends — iterate bottom-up so the saved order is preserved
  for (let i = restored.length - 1; i >= 0; i--) {
    layerStore.addLayer(restored[i])
  }

  const mapStore = useMapStore.getState()
  if (project.map?.provider) mapStore.setProvider(project.map.provider)
  if (project.map?.center && typeof project.map.zoom === 'number') {
    mapStore.setCenter(project.map.center)
    mapStore.setZoom(project.map.zoom)
    mapStore.requestJumpTo(project.map.center, project.map.zoom)
  }

  // Seed incremental-save state: re-saving to the same path with no layer
  // changes rewrites nothing.
  lastSavedPath = projectPath ?? null
  lastSavedVersions.clear()
  for (const l of useLayerStore.getState().layers) {
    if (l.sourceVersion !== undefined) lastSavedVersions.set(l.id, l.sourceVersion)
  }

  return { warnings }
}

export interface LazyLoadFailure {
  id: string
  name: string
  error: string
}

const lazyInflight = new Set<string>()

/** Fetch sidecar data for layers that just became visible (lazy placeholders
 *  from a loaded project). Fills the source and clears the lazy marker;
 *  failures keep the placeholder so toggling visibility again retries. */
export async function loadLazyLayers(layers: Layer[]): Promise<{ failed: LazyLoadFailure[] }> {
  const failed: LazyLoadFailure[] = []
  const targets = layers.filter(
    (l) => l.type === 'geojson' && l.visible && l.lazy && !lazyInflight.has(l.id)
  )
  await Promise.all(
    targets.map(async (l) => {
      lazyInflight.add(l.id)
      try {
        const fc = await readProjectFile(l.lazy!.path)
        const cur = useLayerStore.getState().layers.find((x) => x.id === l.id)
        if (!cur || !cur.lazy) return // removed or already loaded meanwhile
        useLayerStore.getState().setSource(l.id, fc)
        useLayerStore.getState().clearLazy(l.id)
      } catch (e) {
        failed.push({ id: l.id, name: l.name, error: (e as Error).message })
      } finally {
        lazyInflight.delete(l.id)
      }
    })
  )
  return { failed }
}
