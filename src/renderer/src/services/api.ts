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

async function getJson<T>(path: string): Promise<T> {
  const resp = await fetch(`${baseUrl}${path}`)
  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(detail)
  }
  return resp.json() as Promise<T>
}

/** Extract FastAPI's {"detail": "..."} message from a thrown error, if present. */
export function parseApiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  try {
    const parsed = JSON.parse(raw) as { detail?: string }
    return parsed.detail || raw
  } catch {
    return raw
  }
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

/** Parse a local .osm.pbf extract server-side (read from disk, no upload). */
export async function importPbfFile(
  path: string
): Promise<{ layers: ImportedLayer[]; truncated: boolean }> {
  return postJson('/data/import/pbf', { path })
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
// Layer export (SHP / GPKG / KML / CSV — GeoJSON is written by the renderer)
// ---------------------------------------------------------------------------

export type ExportFormat = 'geojson' | 'shp' | 'gpkg' | 'kml' | 'csv'

/** Export a layer server-side into `dir`. Returns the written file paths. */
export async function exportLayer(
  geojson: GeoJSON.FeatureCollection,
  format: Exclude<ExportFormat, 'geojson'>,
  dir: string,
  name: string
): Promise<string[]> {
  const data = await postJson<{ files: string[] }>('/data/export', {
    geojson,
    format,
    path: dir,
    name,
  })
  return data.files
}

// ---------------------------------------------------------------------------
// SQL workbench (DuckDB)
// ---------------------------------------------------------------------------

export interface SqlColumn {
  name: string
  type: string
  geometry: boolean
}

export interface SqlTableInfo {
  table: string
  rows: number | null // null for lazy file views (no full scan)
  columns: SqlColumn[]
  kind?: 'layer' | 'file'
  path?: string | null
}

export interface SqlQueryResult {
  columns: SqlColumn[]
  rows: unknown[][]
  row_count: number
  truncated: boolean
}

export async function sqlStatus(): Promise<{ spatial: boolean }> {
  return getJson('/sql/status')
}

export async function sqlListTables(): Promise<SqlTableInfo[]> {
  const data = await getJson<{ tables: SqlTableInfo[] }>('/sql/tables')
  return data.tables
}

/** Register a layer as a DuckDB table (re-registering by layer_id replaces it). */
export async function sqlRegisterTable(
  name: string,
  geojson: GeoJSON.FeatureCollection,
  layerId: string
): Promise<SqlTableInfo> {
  return postJson('/sql/tables', { name, geojson, layer_id: layerId })
}

/** Register a local file (GPKG/SHP/GeoJSON/CSV/Parquet…) as a lazy DuckDB view. */
export async function sqlRegisterFile(path: string): Promise<SqlTableInfo> {
  return postJson('/sql/files', { path })
}

export async function sqlQuery(sql: string, limit = 1000): Promise<SqlQueryResult> {
  return postJson('/sql/query', { sql, limit })
}

export async function sqlQueryGeojson(sql: string): Promise<GeoJSON.FeatureCollection> {
  return postJson('/sql/query/geojson', { sql })
}

// ---------------------------------------------------------------------------
// Vector analysis
// ---------------------------------------------------------------------------

export type AnalysisOp =
  | 'buffer'
  | 'clip'
  | 'intersection'
  | 'difference'
  | 'union'
  | 'dissolve'
  | 'convex_hull'
  | 'centroid'
  | 'simplify'
  | 'select_by_location'

export interface AnalysisParams {
  distance?: number
  tolerance?: number
  field?: string
  predicate?: 'intersects' | 'within' | 'contains' | 'disjoint'
}

export async function runAnalysis(
  op: AnalysisOp,
  primary: GeoJSON.FeatureCollection,
  secondary: GeoJSON.FeatureCollection | null,
  params: AnalysisParams
): Promise<GeoJSON.FeatureCollection & { skipped?: number }> {
  return postJson('/analysis/run', { op, primary, secondary, params })
}

// ---------------------------------------------------------------------------
// Data monitoring (weather / earthquakes / typhoons)
// ---------------------------------------------------------------------------

export interface RainviewerFrame {
  host: string
  path: string
  time: number | null
  tile_template: string
}

export interface RadarFrame {
  time: number | null
  tile_template: string
  nowcast: boolean
}

/** USGS earthquakes (proxied by the Python backend). */
export async function fetchEarthquakes(feed = 'all_day'): Promise<GeoJSON.FeatureCollection> {
  return getJson(`/monitor/earthquakes?feed=${encodeURIComponent(feed)}`)
}

/** Active west-Pacific typhoon tracks as GeoJSON (proxied by the Python backend). */
export async function fetchTyphoons(): Promise<GeoJSON.FeatureCollection> {
  return getJson('/monitor/typhoons')
}

/** Latest RainViewer precipitation radar frame. */
export async function fetchRainviewerFrame(): Promise<RainviewerFrame> {
  return getJson('/monitor/rainviewer')
}

/** Full RainViewer radar timeline (past + short-term forecast frames). */
export async function fetchRainviewerFrames(): Promise<RadarFrame[]> {
  const data = await getJson<RainviewerFrame & { frames?: RadarFrame[] }>('/monitor/rainviewer')
  if (data.frames?.length) return data.frames
  // Older backend without frames — degrade to a single-frame timeline
  return [{ time: data.time, tile_template: data.tile_template, nowcast: false }]
}

/** OpenWeatherMap raster tile template — loaded directly by MapLibre, key required. */
export function getOwmTileTemplate(owmLayer: string, apiKey: string): string {
  return `https://tile.openweathermap.org/map/${owmLayer}/{z}/{x}/{y}.png?appid=${apiKey}`
}

/** NASA FIRMS wildfire detections, last 24 h (proxied; free MAP_KEY required). */
export async function fetchFires(
  apiKey: string
): Promise<GeoJSON.FeatureCollection & { truncated?: boolean }> {
  return getJson(`/monitor/fires?key=${encodeURIComponent(apiKey)}`)
}

/** GDACS global disaster alerts (proxied, no key). */
export async function fetchGdacs(): Promise<GeoJSON.FeatureCollection> {
  return getJson('/monitor/gdacs')
}

/** WAQI air-quality stations in a bbox (proxied; free token required). */
export async function fetchWaqi(
  token: string,
  south: number,
  west: number,
  north: number,
  east: number
): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({
    token,
    south: String(south),
    west: String(west),
    north: String(north),
    east: String(east),
  })
  return getJson(`/monitor/waqi?${params}`)
}

/** NASA GIBS WMTS satellite imagery layers (no key). */
export interface GibsLayerDef {
  id: string
  matrixSet: string
  ext: 'jpg' | 'png'
  maxzoom: number
  /** Daily layers need an explicit UTC date; static layers accept 'default'. */
  daily: boolean
}

export const GIBS_LAYERS = {
  truecolor: {
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    matrixSet: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxzoom: 9,
    daily: true,
  },
  sst: {
    id: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
    matrixSet: 'GoogleMapsCompatible_Level7',
    ext: 'png',
    maxzoom: 7,
    daily: true,
  },
  nightlights: {
    id: 'VIIRS_Black_Marble',
    matrixSet: 'GoogleMapsCompatible_Level8',
    ext: 'png',
    maxzoom: 8,
    daily: false,
  },
} as const satisfies Record<string, GibsLayerDef>

export type GibsOverlayKey = keyof typeof GIBS_LAYERS

/** GIBS raster tile template; daily layers use yesterday (UTC) for full coverage. */
export function getGibsTileTemplate(key: GibsOverlayKey): string {
  const def = GIBS_LAYERS[key]
  const time = def.daily
    ? new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
    : 'default'
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${def.id}/default/${time}/${def.matrixSet}/{z}/{y}/{x}.${def.ext}`
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

export interface GeoTiffInfo {
  id: string
  name: string
  bounds: [number, number, number, number] // [west, south, east, north]
  minzoom: number
  maxzoom: number
  band_count: number
  has_overviews: boolean
}

/** Register a local GeoTIFF/COG as a dynamically rendered tile source. */
export async function registerGeoTiff(path: string): Promise<GeoTiffInfo> {
  return postJson('/tiles/geotiff', { path })
}

/** XYZ URL template for a registered GeoTIFF source. */
export function getGeoTiffUrlTemplate(sourceId: string): string {
  return `${baseUrl}/tiles/geotiff/${sourceId}/{z}/{x}/{y}.png`
}

/** XYZ URL template served by the local Python backend for a registered source. */
export function getTileSourceUrlTemplate(sourceId: string): string {
  return `${baseUrl}/tiles/sources/${sourceId}/{z}/{x}/{y}`
}
