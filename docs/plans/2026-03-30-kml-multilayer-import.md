# KML Multi-Layer Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import KML files as multiple map layers, one per KML folder/layer, matching how OSM extraction imports layers.

**Architecture:** Unify the `/data/import` response to always return `{ layers: [{ name, geojson }] }`. Python uses `fiona.listlayers()` to enumerate KML layers; non-KML formats return a single-item list. Frontend iterates the list and calls `addLayer` for each item.

**Tech Stack:** Python fiona, FastAPI, React, Zustand layerStore

---

### Task 1: Update Python service — multi-layer KML support

**Files:**
- Modify: `python/services/gis.py`

**Step 1: Replace `file_to_geojson` with `file_to_layers`**

The new function always returns a list of `{ name, geojson }` dicts. For KML/KMZ it enumerates all fiona layers; for other formats it wraps the existing logic in a single-item list.

```python
import json
from pathlib import Path


def file_to_layers(file_path: str, filename: str = '') -> list[dict]:
    """
    Convert a GIS file to a list of { name, geojson } dicts.
    KML/KMZ may return multiple items (one per layer/folder).
    All other formats return a single-item list.
    """
    ext = Path(file_path).suffix.lower()
    base_name = Path(filename or file_path).stem

    if ext in ('.geojson', '.json'):
        with open(file_path, encoding='utf-8') as f:
            return [{'name': base_name, 'geojson': json.load(f)}]

    try:
        import fiona
        from shapely.geometry import mapping, shape

        if ext in ('.kml', '.kmz'):
            layer_names = fiona.listlayers(file_path)
            results = []
            for layer_name in layer_names:
                with fiona.open(file_path, layer=layer_name) as src:
                    features = []
                    for feat in src:
                        geom = feat.get('geometry')
                        if geom:
                            features.append({
                                'type': 'Feature',
                                'geometry': mapping(shape(geom)),
                                'properties': dict(feat.get('properties') or {}),
                            })
                    if features:
                        results.append({
                            'name': layer_name,
                            'geojson': {'type': 'FeatureCollection', 'features': features},
                        })
            # Fallback: if no named layers produced features, treat as single layer
            if not results:
                return [{'name': base_name, 'geojson': {'type': 'FeatureCollection', 'features': []}}]
            return results

        # All other fiona-supported formats (SHP, GPX, …)
        features = []
        with fiona.open(file_path) as src:
            for feat in src:
                geom = feat.get('geometry')
                if geom:
                    features.append({
                        'type': 'Feature',
                        'geometry': mapping(shape(geom)),
                        'properties': dict(feat.get('properties') or {}),
                    })
        return [{'name': base_name, 'geojson': {'type': 'FeatureCollection', 'features': features}}]

    except ImportError:
        raise ValueError(f"Format {ext} requires fiona/GDAL which is not installed")
```

**Step 2: Keep old `file_to_geojson` as a shim (for safety) or delete**

Since `file_to_geojson` is only imported in `data.py`, we will replace the import there in Task 2. Delete the old function entirely — no shim needed.

**Step 3: Verify the file is syntactically correct**

```bash
cd /Users/liming/Code/GITHUB/yutu-gis/python && python -c "from services.gis import file_to_layers; print('OK')"
```
Expected output: `OK`

---

### Task 2: Update Python router — return unified layers response

**Files:**
- Modify: `python/routers/data.py:1-28`

**Step 1: Replace import and endpoint body**

Change the import at the top:
```python
from services.gis import file_to_layers
```

Replace the `/import` endpoint:
```python
@router.post("/import")
async def import_file(file: UploadFile = File(...)):
    filename = file.filename or 'file.geojson'
    suffix = Path(filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        layers = file_to_layers(tmp_path, filename)
        return {'layers': layers}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)
```

**Step 2: Verify server starts without errors**

```bash
cd /Users/liming/Code/GITHUB/yutu-gis/python && python -c "from routers.data import router; print('OK')"
```
Expected output: `OK`

---

### Task 3: Update frontend API client

**Files:**
- Modify: `src/renderer/src/services/api.ts:25-35`

**Step 1: Update `importGisFile` return type and parsing**

```typescript
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
```

---

### Task 4: Update App.tsx handleImport — add multiple layers

**Files:**
- Modify: `src/renderer/src/App.tsx:107-125`

**Step 1: Rewrite `handleImport` to iterate layers**

```typescript
const handleImport = async () => {
  const filePath = await window.electronAPI.openFileDialog([
    { name: 'GIS Files', extensions: ['geojson', 'json', 'shp', 'kml', 'gpx'] },
    { name: 'All Files', extensions: ['*'] },
  ])
  if (!filePath) return
  try {
    const layers = await importGisFile(filePath)
    let lastId = ''
    for (const { name, geojson } of layers) {
      const id = nanoid()
      addLayer({ id, name, type: 'geojson', source: geojson, visible: true, opacity: 1 })
      lastId = id
    }
    if (lastId) setSelectedLayer(lastId)
    const allFeatures = layers.flatMap((l) => l.geojson.features)
    const combined: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: allFeatures }
    const bounds = getGeoJSONBounds(combined)
    if (bounds) requestFitBounds(bounds)
    if (layers.length === 1) {
      message.success(`已导入：${layers[0].name}`)
    } else {
      message.success(`已导入 ${layers.length} 个图层`)
    }
  } catch (e) {
    message.error(`导入失败：${(e as Error).message}`)
  }
}
```

**Step 2: Typecheck**

```bash
cd /Users/liming/Code/GITHUB/yutu-gis && npm run typecheck
```
Expected: no errors

---

### Task 5: Commit

```bash
cd /Users/liming/Code/GITHUB/yutu-gis
git add python/services/gis.py python/routers/data.py \
        src/renderer/src/services/api.ts src/renderer/src/App.tsx
git commit -m "feat(import): support KML multi-layer import"
```
