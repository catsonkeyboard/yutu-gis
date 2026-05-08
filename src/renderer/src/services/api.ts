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
// Airport lookup by IATA code
// ---------------------------------------------------------------------------

export interface AirportInfo {
  iata: string
  name: string
  bbox: [number, number, number, number] // [west, south, east, north]
}

export async function searchAirportByIata(code: string): Promise<AirportInfo> {
  const resp = await fetch(`${baseUrl}/data/airport/iata/${encodeURIComponent(code.toUpperCase())}`)
  if (!resp.ok) {
    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.detail || text)
    } catch (e) {
      if (e instanceof Error && e.message !== 'Unexpected end of JSON input' && !e.message.startsWith('Unexpected token')) {
        throw e
      }
      throw new Error(text)
    }
  }
  return resp.json() as Promise<AirportInfo>
}
