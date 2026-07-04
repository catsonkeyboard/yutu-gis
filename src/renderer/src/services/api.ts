let baseUrl = ''

export async function initApi(): Promise<void> {
  const port = await window.electronAPI.getPythonPort()
  baseUrl = `http://127.0.0.1:${port}`
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(detail)
  }
  return resp.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// File import
// ---------------------------------------------------------------------------

export interface ImportedLayer {
  name: string
  geojson: GeoJSON.FeatureCollection
}

export async function importGisFile(filePath: string): Promise<ImportedLayer[]> {
  const buffer = await window.electronAPI.readFile(filePath)
  const filename = filePath.split('/').pop() ?? 'file.geojson'
  const blob = new Blob([new Uint8Array(buffer)])
  const formData = new FormData()
  formData.append('file', blob, filename)

  const resp = await fetch(`${baseUrl}/data/import`, { method: 'POST', body: formData })
  if (!resp.ok) throw new Error(await resp.text())
  const data = await resp.json() as { layers: ImportedLayer[] }
  return data.layers
}

export async function importGisFileFromFile(file: File): Promise<ImportedLayer[]> {
  const formData = new FormData()
  formData.append('file', file, file.name)
  const resp = await fetch(`${baseUrl}/data/import`, { method: 'POST', body: formData })
  if (!resp.ok) throw new Error(await resp.text())
  const data = await resp.json() as { layers: ImportedLayer[] }
  return data.layers
}

// ---------------------------------------------------------------------------
// WFS 1.x / 2.x
// ---------------------------------------------------------------------------

export interface WFSLayer {
  name: string
  title: string
}

export async function wfsGetLayers(url: string): Promise<WFSLayer[]> {
  const data = await postJson<{ layers: WFSLayer[] }>('/data/wfs/layers', { url })
  return data.layers
}

export async function wfsGetFeatures(
  url: string,
  typeName: string,
  maxFeatures: number
): Promise<GeoJSON.FeatureCollection> {
  return postJson('/data/wfs/features', { url, type_name: typeName, max_features: maxFeatures })
}

// ---------------------------------------------------------------------------
// OGC API Features
// ---------------------------------------------------------------------------

export interface OGCCollection {
  id: string
  title: string
}

export async function ogcGetCollections(url: string): Promise<OGCCollection[]> {
  const data = await postJson<{ collections: OGCCollection[] }>('/data/ogc/collections', { url })
  return data.collections
}

export async function ogcGetFeatures(
  url: string,
  collectionId: string,
  maxFeatures: number
): Promise<GeoJSON.FeatureCollection> {
  return postJson('/data/ogc/features', { url, collection_id: collectionId, max_features: maxFeatures })
}

// ---------------------------------------------------------------------------
// OSM Feature Extraction
// ---------------------------------------------------------------------------

export async function osmExtract(south: number, west: number, north: number, east: number): Promise<GeoJSON.FeatureCollection> {
  return postJson('/data/osm/extract', { south, west, north, east })
}

// ---------------------------------------------------------------------------
// Map tile download
// ---------------------------------------------------------------------------

export interface TileDownloadRequest {
  south: number
  west: number
  north: number
  east: number
  min_zoom: number
  max_zoom: number
  url_template: string
  output: 'mbtiles' | 'directory'
  path: string
  name: string
}

export interface TileTaskState {
  task_id: string
  total: number
  done: number
  failed: number
  skipped: number
  status: 'running' | 'completed' | 'cancelled' | 'error'
  message: string
}

export async function startTileDownload(
  req: TileDownloadRequest
): Promise<{ task_id: string; total: number }> {
  return postJson('/tiles/download', req)
}

export async function getTileTask(taskId: string): Promise<TileTaskState> {
  const resp = await fetch(`${baseUrl}/tiles/tasks/${taskId}`)
  if (!resp.ok) throw new Error(await resp.text())
  return resp.json() as Promise<TileTaskState>
}

export async function cancelTileTask(taskId: string): Promise<void> {
  const resp = await fetch(`${baseUrl}/tiles/tasks/${taskId}/cancel`, { method: 'POST' })
  if (!resp.ok) throw new Error(await resp.text())
}

// ---------------------------------------------------------------------------
// Offline tile sources (local MBTiles / tile directories as map layers)
// ---------------------------------------------------------------------------

export interface TileSourceInfo {
  source_id: string
  name: string
  format: string
  bounds: [number, number, number, number] | null // [west, south, east, north]
  minzoom: number
  maxzoom: number
}

export async function registerTileSource(path: string): Promise<TileSourceInfo> {
  return postJson('/tiles/sources', { path })
}

/** XYZ URL template served by the local Python backend for a registered source. */
export function getTileSourceUrlTemplate(sourceId: string): string {
  return `${baseUrl}/tiles/sources/${sourceId}/{z}/{x}/{y}`
}
