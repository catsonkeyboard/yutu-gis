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

export async function importGisFile(filePath: string): Promise<GeoJSON.FeatureCollection> {
  const buffer = await window.electronAPI.readFile(filePath)
  const filename = filePath.split('/').pop() ?? 'file.geojson'
  const blob = new Blob([new Uint8Array(buffer)])
  const formData = new FormData()
  formData.append('file', blob, filename)

  const resp = await fetch(`${baseUrl}/data/import`, { method: 'POST', body: formData })
  if (!resp.ok) throw new Error(await resp.text())
  return resp.json() as Promise<GeoJSON.FeatureCollection>
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

export async function osmExtract(lat: number, lon: number): Promise<GeoJSON.FeatureCollection> {
  return postJson('/data/osm/extract', { lat, lon })
}
