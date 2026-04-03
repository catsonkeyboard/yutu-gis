# Multi-Layer Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the toolbar's single-layer export with a modal that lets the user select any subset of GeoJSON layers and export each as a separate `.geojson` file into a chosen directory.

**Architecture:** Add a `dialog:openDirectory` IPC channel (main + preload), build an `ExportLayersModal` component, and update `App.tsx` to open the modal instead of the old inline `handleExport` function.

**Tech Stack:** Electron IPC, React + Ant Design (Modal, Checkbox, Button, message), Zustand layerStore, `window.electronAPI.writeFile`

---

### Task 1: Add `openDirectoryDialog` IPC

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

**Step 1: Add handler in `src/main/ipc.ts`**

After the existing `dialog:saveFile` handler (line 28), add:

```ts
ipcMain.handle('dialog:openDirectory', async (_event) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})
```

**Step 2: Expose in `src/preload/index.ts`**

Add to the `electronAPI` object after `saveFileDialog`:

```ts
openDirectoryDialog: (): Promise<string | null> =>
  ipcRenderer.invoke('dialog:openDirectory'),
```

Also update the TypeScript declaration (the `electronAPI` object is typed inline via `contextBridge.exposeInMainWorld`; no separate `.d.ts` file exists — the type is inferred at call sites via `window.electronAPI`).

**Step 3: Verify TypeScript compiles**

```bash
npm run typecheck
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat(ipc): add openDirectoryDialog IPC channel"
```

---

### Task 2: Add locale strings

**Files:**
- Modify: `src/renderer/src/locales/zh.json`
- Modify: `src/renderer/src/locales/en.json`

**Step 1: Add to `zh.json`**

Add a new `"export"` key at the top level (after `"osm"`):

```json
"export": {
  "modalTitle": "批量导出图层",
  "noLayers": "暂无可导出的图层",
  "selectDir": "选择导出目录",
  "success": "已导出 {{count}} 个图层",
  "errorFile": "导出失败：{{name}} — {{error}}"
}
```

**Step 2: Add to `en.json`**

```json
"export": {
  "modalTitle": "Export Layers",
  "noLayers": "No exportable layers",
  "selectDir": "Choose Export Directory",
  "success": "Exported {{count}} layer(s)",
  "errorFile": "Export failed: {{name}} — {{error}}"
}
```

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/renderer/src/locales/zh.json src/renderer/src/locales/en.json
git commit -m "feat(i18n): add export modal locale strings"
```

---

### Task 3: Build `ExportLayersModal` component

**Files:**
- Create: `src/renderer/src/components/Toolbar/ExportLayersModal.tsx`

**Step 1: Create the component**

```tsx
import { useState, useEffect } from 'react'
import { Modal, Checkbox, Button, Space, Typography, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useLayerStore, type Layer } from '../../stores/layerStore'

interface Props {
  open: boolean
  onClose: () => void
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_')
}

function uniqueFileNames(layers: Layer[]): Map<string, string> {
  // Returns Map<layerId, fileName> with deduplication
  const seen = new Map<string, number>()
  const result = new Map<string, string>()
  for (const layer of layers) {
    const base = sanitizeName(layer.name)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    result.set(layer.id, count === 0 ? base : `${base}_${count + 1}`)
  }
  return result
}

export default function ExportLayersModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const layers = useLayerStore((s) => s.layers.filter((l) => l.type === 'geojson'))
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  // Reset selection when modal opens
  useEffect(() => {
    if (open) {
      setCheckedIds(new Set(layers.map((l) => l.id)))
    }
  }, [open, layers])

  const toggleAll = (checked: boolean) => {
    setCheckedIds(checked ? new Set(layers.map((l) => l.id)) : new Set())
  }

  const toggle = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleExport = async () => {
    const dir = await window.electronAPI.openDirectoryDialog()
    if (!dir) return

    const selected = layers.filter((l) => checkedIds.has(l.id))
    const fileNames = uniqueFileNames(selected)
    setExporting(true)
    let successCount = 0

    for (const layer of selected) {
      const fileName = fileNames.get(layer.id)!
      const filePath = `${dir}/${fileName}.geojson`
      try {
        await window.electronAPI.writeFile(filePath, JSON.stringify(layer.source, null, 2))
        successCount++
      } catch (e) {
        message.error(t('export.errorFile', { name: layer.name, error: (e as Error).message }))
      }
    }

    setExporting(false)
    if (successCount > 0) {
      message.success(t('export.success', { count: successCount }))
    }
    onClose()
  }

  const allChecked = layers.length > 0 && checkedIds.size === layers.length
  const indeterminate = checkedIds.size > 0 && checkedIds.size < layers.length

  return (
    <Modal
      title={t('export.modalTitle')}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            disabled={checkedIds.size === 0}
            loading={exporting}
            onClick={handleExport}
          >
            {t('export.selectDir')}
          </Button>
        </Space>
      }
      width={400}
    >
      {layers.length === 0 ? (
        <Typography.Text type="secondary">{t('export.noLayers')}</Typography.Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Checkbox
            indeterminate={indeterminate}
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
          >
            全选
          </Checkbox>
          {layers.map((layer) => (
            <Checkbox
              key={layer.id}
              checked={checkedIds.has(layer.id)}
              onChange={(e) => toggle(layer.id, e.target.checked)}
            >
              {layer.name}
            </Checkbox>
          ))}
        </Space>
      )}
    </Modal>
  )
}
```

**Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/renderer/src/components/Toolbar/ExportLayersModal.tsx
git commit -m "feat(export): add ExportLayersModal component"
```

---

### Task 4: Wire modal into `App.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Add import for `ExportLayersModal`**

Near the other component imports, add:

```ts
import ExportLayersModal from './components/Toolbar/ExportLayersModal'
```

**Step 2: Add modal open state**

In the `App` component body, alongside `settingsOpen`, `wfsOpen`, etc., add:

```ts
const [exportOpen, setExportOpen] = useState(false)
```

**Step 3: Remove `handleExport` and replace with the state setter**

Delete the entire `handleExport` function (lines 198–215 in current file).

In the `<Toolbar>` JSX, change:
```tsx
onExport={handleExport}
```
to:
```tsx
onExport={() => setExportOpen(true)}
```

**Step 4: Add `<ExportLayersModal>` to JSX**

Alongside the other modals in the return block, add:

```tsx
<ExportLayersModal open={exportOpen} onClose={() => setExportOpen(false)} />
```

**Step 5: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

**Step 6: Smoke test manually**

1. `npm run dev`
2. Import at least two GeoJSON layers
3. Click the export button in toolbar — modal opens with both layers checked
4. Uncheck one, click "选择导出目录", pick a folder
5. Confirm two (or one) `.geojson` files appear in the folder
6. Verify `message.success` appears with correct count

**Step 7: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(export): wire ExportLayersModal into App, replace single-layer export"
```
