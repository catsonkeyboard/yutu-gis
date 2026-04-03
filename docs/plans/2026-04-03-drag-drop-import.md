# Drag-and-Drop File Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to drag GeoJSON / KML / GPX files from the OS onto the map canvas to import them, reusing the existing import dialog and layer creation flow.

**Architecture:** Add `importGisFileFromFile(file: File)` to `api.ts` (sends the `File` object directly as multipart — no IPC readFile needed). In `App.tsx`, attach `onDragOver` / `onDragLeave` / `onDrop` to `<Content>`, add an `isDragOver` state for a visual overlay, and a `handleFileDrop` handler that guards on draw mode, validates the extension, calls the new API function, then routes into the existing `applyImport` / import-dialog flow.

**Tech Stack:** React 19, TypeScript 5, Ant Design 6, Electron 39 renderer (no IPC changes needed)

---

### Task 1: Add `importGisFileFromFile` to `api.ts`

**Files:**
- Modify: `src/renderer/src/services/api.ts`

The browser drag event gives us a `File` object that already contains the raw bytes — we can POST it directly as multipart without going through `window.electronAPI.readFile`.

**Step 1: Open `api.ts` and add the new export after `importGisFile`**

Location: after line 41 (end of `importGisFile` function).

```ts
export async function importGisFileFromFile(file: File): Promise<ImportedLayer[]> {
  const formData = new FormData()
  formData.append('file', file, file.name)
  const resp = await fetch(`${baseUrl}/data/import`, { method: 'POST', body: formData })
  if (!resp.ok) throw new Error(await resp.text())
  const data = await resp.json() as { layers: ImportedLayer[] }
  return data.layers
}
```

**Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors

**Step 3: Commit**

```bash
git add src/renderer/src/services/api.ts
git commit -m "feat(import): add importGisFileFromFile for drag-drop support"
```

---

### Task 2: Add drag state and handler to `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Add the import for `importGisFileFromFile`**

In `App.tsx` line 8, the existing import is:
```ts
import { initApi, importGisFile, type ImportedLayer } from './services/api'
```

Change to:
```ts
import { initApi, importGisFile, importGisFileFromFile, type ImportedLayer } from './services/api'
```

**Step 2: Add `isDragOver` state**

After line 42 (`const [exportOpen, setExportOpen] = useState(false)`), add:
```ts
const [isDragOver, setIsDragOver] = useState(false)
```

Also grab `drawMode` from `useDrawStore` — the existing destructure on line 47 is:
```ts
const { features, setMode, clear } = useDrawStore()
```

Change to:
```ts
const { features, setMode, clear, drawMode } = useDrawStore()
```

**Step 3: Add `handleFileDrop` handler**

Add this function after `handleImport` (after line 160):

```ts
const ALLOWED_DROP_EXTENSIONS = new Set(['geojson', 'json', 'kml', 'gpx'])

const handleFileDrop = async (file: File) => {
  if (drawMode !== 'off') return
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_DROP_EXTENSIONS.has(ext)) {
    message.error('不支持的文件类型，请使用 GeoJSON / KML / GPX')
    return
  }
  try {
    const layers = await importGisFileFromFile(file)
    const totalFeatures = layers.reduce((sum, l) => sum + l.geojson.features.length, 0)
    if (totalFeatures <= 1) {
      applyImport(layers, 'merge')
      return
    }
    setImportMode('merge')
    setPendingImportLayers(layers)
    setImportDialogOpen(true)
  } catch (e) {
    message.error(`导入失败：${(e as Error).message}`)
  }
}
```

**Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors

**Step 5: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(import): add drag-drop handler and state in App"
```

---

### Task 3: Wire drag events and overlay onto `<Content>`

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Replace the `<Content>` opening tag**

Find (around line 259):
```tsx
<Content style={{ position: 'relative', overflow: 'hidden' }}>
```

Replace with:
```tsx
<Content
  style={{ position: 'relative', overflow: 'hidden' }}
  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
  onDragLeave={(e) => {
    // Only clear when leaving the Content element itself, not its children
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }}
  onDrop={(e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileDrop(file)
  }}
>
```

**Step 2: Add the drop overlay inside `<Content>`, just before `<MapCanvas ...`**

Find (around line 261):
```tsx
          <MapCanvas
```

Insert before it:
```tsx
          {isDragOver && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                background: 'rgba(22, 119, 255, 0.08)',
                border: '3px dashed #1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{
                background: 'rgba(255,255,255,0.9)',
                padding: '8px 20px',
                borderRadius: 8,
                fontSize: 15,
                color: '#1677ff',
                fontWeight: 500,
              }}>
                松开以导入
              </span>
            </div>
          )}
          <MapCanvas
```

**Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(import): wire drag events and drop overlay onto map canvas"
```

---

### Task 4: Manual verification

**Step 1: Start the app**

```bash
npm run dev
```

**Step 2: Test — happy path (GeoJSON)**

1. Find any `.geojson` file in Finder
2. Drag it onto the map canvas
3. Expected: blue dashed overlay + "松开以导入" appears while hovering
4. Drop the file
5. Expected: if features ≤ 1 → layer added directly; if > 1 → import options modal appears

**Step 3: Test — merge/split dialog**

1. Use a GeoJSON with multiple features
2. Drop onto map
3. Expected: "导入选项" modal with merge/split radio buttons (same as toolbar import)
4. Confirm → layer(s) created, map fits to bounds

**Step 4: Test — unsupported file type**

1. Drag a `.shp` or `.txt` file onto map
2. Expected: `message.error('不支持的文件类型，请使用 GeoJSON / KML / GPX')`
3. No overlay should remain

**Step 5: Test — draw mode guard**

1. Activate any draw tool in toolbar
2. Drag a GeoJSON onto map
3. Expected: nothing happens (drop silently ignored)

**Step 6: Test — dragleave boundary**

1. Drag a file over the map
2. Move cursor to the layer panel (left sider) without dropping
3. Expected: overlay disappears when cursor leaves map area

**Step 7: Commit if all good (no code changes needed)**

If any bug found during manual testing, fix and commit with `fix(import): ...` prefix.
