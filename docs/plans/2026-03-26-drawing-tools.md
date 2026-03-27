# Drawing Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add point / line / polygon (fence) drawing tools to the map, with save-as-layer and GeoJSON export.

**Architecture:** `@mapbox/mapbox-gl-draw` drives all drawing interaction with its default UI hidden. A new `drawStore` (Zustand) holds current draw mode and temporary features. Toolbar buttons toggle draw modes; MapCanvas reacts to store changes to call the draw API. On exit, App shows a naming modal then commits features to `layerStore`. Export writes via a new `writeFile` IPC handler.

**Tech Stack:** `@mapbox/mapbox-gl-draw` v1.5.x, `@types/mapbox__mapbox-gl-draw`, MapLibre GL JS v5, Zustand 5, Ant Design 6, Electron IPC.

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm)

**Step 1: Install draw library and its types**

```bash
cd /path/to/project
npm install @mapbox/mapbox-gl-draw
npm install --save-dev @types/mapbox__mapbox-gl-draw
```

**Step 2: Verify package.json has both entries**

`package.json` dependencies should contain `"@mapbox/mapbox-gl-draw"` and devDependencies `"@types/mapbox__mapbox-gl-draw"`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @mapbox/mapbox-gl-draw dependency"
```

---

## Task 2: Add `writeFile` IPC handler

The export feature needs to write a file. Currently only `readFile` exists.

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

**Step 1: Add handler in `src/main/ipc.ts`**

Add this import at the top:
```ts
import { readFile, writeFile } from 'fs/promises'
```
(replace the existing `readFile` import)

Add this handler inside `registerIpcHandlers`:
```ts
ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  await writeFile(filePath, content, 'utf-8')
})
```

**Step 2: Expose in `src/preload/index.ts`**

Add to the `electronAPI` object:
```ts
writeFile: (filePath: string, content: string): Promise<void> =>
  ipcRenderer.invoke('fs:writeFile', filePath, content),
```

**Step 3: Update the global type declaration**

Find the `Window` interface declaration (search for `interface ElectronAPI` or `interface Window` in `src/renderer/src/env.d.ts` or similar). Add:
```ts
writeFile: (filePath: string, content: string) => Promise<void>
```

> Tip: Run `grep -r "electronAPI" src/renderer/src --include="*.d.ts" --include="*.ts" -l` to find where the type lives.

**Step 4: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: add writeFile IPC handler for GeoJSON export"
```

---

## Task 3: Create `drawStore.ts`

**Files:**
- Create: `src/renderer/src/stores/drawStore.ts`

**Step 1: Write the store**

```ts
import { create } from 'zustand'

export type DrawMode = 'off' | 'point' | 'line' | 'polygon'

interface DrawState {
  drawMode: DrawMode
  features: GeoJSON.Feature[]
  setMode: (mode: DrawMode) => void
  setFeatures: (features: GeoJSON.Feature[]) => void
  clear: () => void
}

export const useDrawStore = create<DrawState>((set) => ({
  drawMode: 'off',
  features: [],
  setMode: (drawMode) => set({ drawMode }),
  setFeatures: (features) => set({ features }),
  clear: () => set({ drawMode: 'off', features: [] }),
}))
```

**Step 2: Commit**

```bash
git add src/renderer/src/stores/drawStore.ts
git commit -m "feat: add drawStore for drawing mode and temporary features"
```

---

## Task 4: Create `DrawHintBanner.tsx`

This component shows a contextual hint bar at the top of the map while a draw mode is active.

**Files:**
- Create: `src/renderer/src/components/MapCanvas/DrawHintBanner.tsx`

**Step 1: Write the component**

```tsx
import { useDrawStore } from '../../stores/drawStore'

const HINTS: Record<string, string> = {
  point: '点击地图添加点，按 Escape 取消',
  line: '点击添加节点，双击完成绘制，按 Escape 取消',
  polygon: '点击添加顶点，点击起点或双击完成围栏，按 Escape 取消',
}

export default function DrawHintBanner() {
  const drawMode = useDrawStore((s) => s.drawMode)
  if (drawMode === 'off') return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: 'rgba(22, 119, 255, 0.9)',
        color: '#fff',
        padding: '4px 16px',
        borderRadius: 4,
        fontSize: 13,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {HINTS[drawMode]}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/MapCanvas/DrawHintBanner.tsx
git commit -m "feat: add DrawHintBanner component"
```

---

## Task 5: Integrate MapboxDraw into `MapCanvas.tsx`

**Files:**
- Modify: `src/renderer/src/components/MapCanvas/MapCanvas.tsx`

**Step 1: Add imports at the top of `MapCanvas.tsx`**

```ts
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { useDrawStore } from '../../stores/drawStore'
import DrawHintBanner from './DrawHintBanner'
```

**Step 2: Add refs and store subscription inside `MapCanvas()`**

After the existing `mapRef` line, add:
```ts
const drawRef = useRef<MapboxDraw | null>(null)
const drawMode = useDrawStore((s) => s.drawMode)
const setFeatures = useDrawStore((s) => s.setFeatures)
```

**Step 3: Initialize MapboxDraw inside the map init `useEffect`**

Inside the existing `useEffect` that creates the map (after `map.addControl(new maplibregl.ScaleControl...)`), add:

```ts
const draw = new MapboxDraw({
  controls: false,        // hide default buttons — toolbar drives mode
  displayControlsDefault: false,
})
// MapboxDraw is compatible with MapLibre's Map instance
;(map as unknown as Parameters<typeof draw.onAdd>[0]) // type cast for TS
map.addControl(draw as unknown as maplibregl.IControl)
drawRef.current = draw

const syncFeatures = () => {
  setFeatures(draw.getAll().features as GeoJSON.Feature[])
}
map.on('draw.create', syncFeatures)
map.on('draw.update', syncFeatures)
map.on('draw.delete', syncFeatures)
```

**Step 4: Add `useEffect` to react to drawMode changes**

After the existing `useEffect` blocks, add a new one:

```ts
useEffect(() => {
  const draw = drawRef.current
  if (!draw || !mapRef.current) return

  if (drawMode === 'off') {
    draw.changeMode('simple_select')
    draw.deleteAll()
  } else if (drawMode === 'point') {
    draw.changeMode('draw_point')
  } else if (drawMode === 'line') {
    draw.changeMode('draw_line_string')
  } else if (drawMode === 'polygon') {
    draw.changeMode('draw_polygon')
  }
}, [drawMode])
```

**Step 5: Add `<DrawHintBanner />` to the return JSX**

Inside the outer `<div>` wrapper (before `<BasemapSwitcher />`), add:
```tsx
<DrawHintBanner />
```

**Step 6: Manual smoke test**

Run `npm run dev`. Verify the app loads without errors. The draw panel should not appear yet (toolbar not wired).

**Step 7: Commit**

```bash
git add src/renderer/src/components/MapCanvas/MapCanvas.tsx
git commit -m "feat: integrate MapboxDraw into MapCanvas"
```

---

## Task 6: Add draw buttons to `Toolbar.tsx`

**Files:**
- Modify: `src/renderer/src/components/Toolbar/Toolbar.tsx`

**Step 1: Add new imports**

Add icons to the existing icon imports:
```ts
import {
  EnvironmentOutlined,
  LineOutlined,
  BorderOutlined,
} from '@ant-design/icons'
import { useDrawStore, type DrawMode } from '../../stores/drawStore'
```

**Step 2: Update the Props interface**

Add `onDrawModeChange` to props:
```ts
interface Props {
  onImport?: () => void
  onExport?: () => void
  onSettings?: () => void
  onWFS?: () => void
  onDrawModeChange?: (mode: DrawMode | 'off') => void
}
```

**Step 3: Read drawMode inside the component**

Add inside `Toolbar()` before the return:
```ts
const drawMode = useDrawStore((s) => s.drawMode)

const handleDraw = (mode: DrawMode) => {
  // Toggle: clicking active mode exits it
  onDrawModeChange?.(drawMode === mode ? 'off' : mode)
}
```

**Step 4: Add draw buttons to the JSX**

After the existing `<Divider type="vertical" />` (before Settings), add another group:
```tsx
<Divider type="vertical" />
<Tooltip title={t('toolbar.drawPoint')}>
  <Button
    icon={<EnvironmentOutlined />}
    type={drawMode === 'point' ? 'primary' : 'text'}
    size="small"
    onClick={() => handleDraw('point')}
  />
</Tooltip>
<Tooltip title={t('toolbar.drawLine')}>
  <Button
    icon={<LineOutlined />}
    type={drawMode === 'line' ? 'primary' : 'text'}
    size="small"
    onClick={() => handleDraw('line')}
  />
</Tooltip>
<Tooltip title={t('toolbar.drawPolygon')}>
  <Button
    icon={<BorderOutlined />}
    type={drawMode === 'polygon' ? 'primary' : 'text'}
    size="small"
    onClick={() => handleDraw('polygon')}
  />
</Tooltip>
```

**Step 5: Commit**

```bash
git add src/renderer/src/components/Toolbar/Toolbar.tsx
git commit -m "feat: add draw mode buttons to Toolbar"
```

---

## Task 7: Wire draw mode + save modal in `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Add new imports**

```ts
import { Modal, Input } from 'antd'
import { useDrawStore, type DrawMode } from './stores/drawStore'
import dayjs from 'dayjs'  // already available via antd's peer deps
```

> If `dayjs` is not available, use `new Date().toLocaleString('zh-CN')` instead.

**Step 2: Add state and store hooks inside `App()`**

```ts
const [saveModalOpen, setSaveModalOpen] = useState(false)
const [pendingLayerName, setPendingLayerName] = useState('')
const { drawMode, features, setMode, clear } = useDrawStore()
```

**Step 3: Add `handleDrawModeChange` handler**

```ts
const handleDrawModeChange = (mode: DrawMode | 'off') => {
  if (mode === 'off' && features.length > 0) {
    // Features exist — prompt to save before exiting
    const defaultName = `绘制图层 ${new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16)}`
    setPendingLayerName(defaultName)
    setSaveModalOpen(true)
  } else {
    setMode(mode as DrawMode)
  }
}
```

**Step 4: Add `handleSaveDraw` handler**

```ts
const handleSaveDraw = () => {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  }
  const id = nanoid()
  addLayer({ id, name: pendingLayerName, type: 'geojson', source: geojson, visible: true, opacity: 1 })
  setSelectedLayer(id)
  const bounds = getGeoJSONBounds(geojson)
  if (bounds) requestFitBounds(bounds)
  clear()
  setSaveModalOpen(false)
  message.success(`已保存图层：${pendingLayerName}`)
}
```

**Step 5: Add export handler**

```ts
const handleExport = async () => {
  const layers = useLayerStore.getState().layers  // read outside hook for event handler
  const selectedId = useLayerStore.getState().selectedLayerId
  const layer = layers.find((l) => l.id === selectedId)
  if (!layer) {
    message.warning('请先选择一个图层')
    return
  }
  const filePath = await window.electronAPI.saveFileDialog([
    { name: 'GeoJSON', extensions: ['geojson'] },
  ])
  if (!filePath) return
  try {
    await window.electronAPI.writeFile(filePath, JSON.stringify(layer.source, null, 2))
    message.success(`已导出：${layer.name}`)
  } catch (e) {
    message.error(`导出失败：${(e as Error).message}`)
  }
}
```

> Note: To read Zustand state outside a React hook (inside a callback), use `useLayerStore.getState()`.

**Step 6: Pass new props to `<Toolbar />`**

Update the `<Toolbar>` JSX:
```tsx
<Toolbar
  onSettings={() => setSettingsOpen(true)}
  onImport={handleImport}
  onExport={handleExport}
  onWFS={() => setWfsOpen(true)}
  onDrawModeChange={handleDrawModeChange}
/>
```

**Step 7: Add the save modal to the JSX**

After the existing modals, add:
```tsx
<Modal
  title="保存绘制图层"
  open={saveModalOpen}
  onOk={handleSaveDraw}
  onCancel={() => setSaveModalOpen(false)}
  okText="保存"
  cancelText="继续绘制"
>
  <Input
    value={pendingLayerName}
    onChange={(e) => setPendingLayerName(e.target.value)}
    placeholder="图层名称"
    onPressEnter={handleSaveDraw}
  />
</Modal>
```

**Step 8: Manual smoke test**

Run `npm run dev`. Test the full flow:
1. Click point draw button → map cursor changes, hint banner appears
2. Click map → point appears
3. Click draw button again → modal opens with default name
4. Confirm → layer appears in panel
5. Click polygon button → draw polygon → exit → save

**Step 9: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: wire draw mode, save modal, and toolbar export in App"
```

---

## Task 8: Add per-layer export button in `LayerPanel.tsx`

**Files:**
- Modify: `src/renderer/src/components/LayerPanel/LayerPanel.tsx`

**Step 1: Add import**

```ts
import { DownloadOutlined } from '@ant-design/icons'
```

Also add a new prop for the export callback:
```ts
interface Props {
  onExportLayer?: (layerId: string) => void
}
export default function LayerPanel({ onExportLayer }: Props) {
```

**Step 2: Add export button to each layer's `actions` array**

In the `renderItem` function, add to the `actions` array (before or after the delete button):
```tsx
<Tooltip key="export" title="导出 GeoJSON">
  <Button
    size="small"
    type="text"
    icon={<DownloadOutlined />}
    onClick={(e) => {
      e.stopPropagation()
      onExportLayer?.(layer.id)
    }}
  />
</Tooltip>,
```

**Step 3: Add `handleExportLayer` in `App.tsx`**

Back in `App.tsx`, add this handler:
```ts
const handleExportLayer = async (layerId: string) => {
  const layer = useLayerStore.getState().layers.find((l) => l.id === layerId)
  if (!layer) return
  const filePath = await window.electronAPI.saveFileDialog([
    { name: 'GeoJSON', extensions: ['geojson'] },
  ])
  if (!filePath) return
  try {
    await window.electronAPI.writeFile(filePath, JSON.stringify(layer.source, null, 2))
    message.success(`已导出：${layer.name}`)
  } catch (e) {
    message.error(`导出失败：${(e as Error).message}`)
  }
}
```

> Tip: `handleExport` (toolbar) and `handleExportLayer` share the same write logic. Extract a helper `exportLayer(layer)` to avoid duplication.

**Step 4: Pass to `<LayerPanel />`**

```tsx
<LayerPanel onExportLayer={handleExportLayer} />
```

**Step 5: Manual smoke test**

1. Import a GeoJSON file
2. Right-click or click the download icon on the layer → save dialog appears → file saved
3. Open the exported file in a text editor — valid GeoJSON

**Step 6: Commit**

```bash
git add src/renderer/src/components/LayerPanel/LayerPanel.tsx src/renderer/src/App.tsx
git commit -m "feat: add per-layer GeoJSON export to LayerPanel"
```

---

## Task 9: Final verification

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

**Step 2: Full feature smoke test**

Run `npm run dev` and verify:

| Scenario | Expected |
|----------|----------|
| Click point button | Button highlights, hint banner shows "点击地图添加点…" |
| Click map | Point appears on map |
| Click line button (while point active) | Switches to line mode, hint updates |
| Double-click to finish line | Line drawn |
| Click active line button again | Save modal appears |
| Enter name, confirm | Layer in panel, map fits bounds |
| Cancel modal | Returns to line draw mode |
| Polygon draw + close → save | Polygon layer created |
| Draw 0 features, exit | No modal, silent exit |
| Toolbar export (layer selected) | Save dialog → valid .geojson written |
| Layer panel export button | Same |
| Toolbar export (no layer selected) | Warning toast |

**Step 3: Commit**

If any fixes were needed:
```bash
git add -p   # stage only relevant changes
git commit -m "fix: drawing tools edge cases"
```
