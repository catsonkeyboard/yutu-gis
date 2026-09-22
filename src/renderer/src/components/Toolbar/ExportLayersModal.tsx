import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Checkbox,
  Classes,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  Intent,
  SegmentedControl,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useLayerStore, type Layer } from '../../stores/layerStore'
import { exportLayer as exportLayerApi, parseApiError, type ExportFormat } from '../../services/api'
import { message } from '../../utils/toaster'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, only this layer is pre-selected (single-layer export entry). */
  initialLayerId?: string | null
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_')
}

function uniqueFileNames(layers: Layer[]): Map<string, string> {
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

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'shp', label: 'Shapefile' },
  { value: 'gpkg', label: 'GeoPackage' },
  { value: 'kml', label: 'KML' },
  { value: 'csv', label: 'CSV' },
]

export default function ExportLayersModal({ open, onClose, initialLayerId }: Props): ReactElement {
  const { t } = useTranslation()
  const layers = useLayerStore(useShallow((s) => s.layers.filter((l) => l.type === 'geojson')))
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [exporting, setExporting] = useState(false)

  // Reset selection when modal opens
  useEffect(() => {
    if (open) {
      setCheckedIds(
        initialLayerId ? new Set([initialLayerId]) : new Set(layers.map((l) => l.id))
      )
    }
  }, [open, initialLayerId, layers])

  const toggleAll = (checked: boolean) => {
    setCheckedIds(checked ? new Set(layers.map((l) => l.id)) : new Set())
  }

  const toggle = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
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
      try {
        if (format === 'geojson') {
          const filePath = `${dir}/${fileName}.geojson`
          await window.electronAPI.writeFile(filePath, JSON.stringify(layer.source, null, 2))
        } else {
          await exportLayerApi(
            layer.source as GeoJSON.FeatureCollection,
            format,
            dir,
            fileName
          )
        }
        successCount++
      } catch (e) {
        message.error(t('export.errorFile', { name: layer.name, error: parseApiError(e) }))
      }
    }

    setExporting(false)
    if (successCount > 0) {
      message.success(t('export.success', { count: successCount }))
      onClose()
    }
  }

  const allChecked = layers.length > 0 && checkedIds.size === layers.length
  const indeterminate = checkedIds.size > 0 && checkedIds.size < layers.length

  return (
    <Dialog
      isOpen={open}
      onClose={exporting ? undefined : onClose}
      title={t('export.modalTitle')}
      icon="export"
      style={{ width: 440 }}
    >
      <DialogBody>
        {layers.length === 0 ? (
          <div className={Classes.TEXT_MUTED} style={{ textAlign: 'center', padding: '24px 0' }}>
            {t('export.noLayers')}
          </div>
        ) : (
          <div>
            <FormGroup label={t('export.format')}>
              <SegmentedControl
                small
                value={format}
                onValueChange={(val) => setFormat(val as ExportFormat)}
                options={FORMATS}
              />
              {format === 'shp' && (
                <div style={{ fontSize: 11, color: '#8f959e', marginTop: 4 }}>
                  {t('export.shpHint')}
                </div>
              )}
            </FormGroup>

            <FormGroup label={t('export.selectLayers') || '选择导出图层'}>
              <div
                style={{
                  border: '1px solid #d9dce0',
                  borderRadius: 3,
                  padding: '8px 10px',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                <div style={{ paddingBottom: 6, borderBottom: '1px solid #f0f0f0', marginBottom: 6 }}>
                  <Checkbox
                    indeterminate={indeterminate}
                    checked={allChecked}
                    onChange={(e) => toggleAll((e.target as HTMLInputElement).checked)}
                    style={{ margin: 0, fontWeight: 600 }}
                  >
                    {t('export.selectAll')} ({checkedIds.size}/{layers.length})
                  </Checkbox>
                </div>
                {layers.map((layer) => (
                  <div key={layer.id} style={{ padding: '2px 0' }}>
                    <Checkbox
                      checked={checkedIds.has(layer.id)}
                      onChange={(e) => toggle(layer.id, (e.target as HTMLInputElement).checked)}
                      style={{ margin: 0 }}
                    >
                      {layer.name}
                    </Checkbox>
                  </div>
                ))}
              </div>
            </FormGroup>
          </div>
        )}
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={onClose} disabled={exporting} text={t('common.cancel')} />
            <Button
              intent={Intent.PRIMARY}
              disabled={checkedIds.size === 0}
              loading={exporting}
              onClick={handleExport}
              text={t('export.selectDir')}
            />
          </>
        }
      />
    </Dialog>
  )
}
