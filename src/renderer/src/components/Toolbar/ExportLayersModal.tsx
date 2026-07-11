import { useState, useEffect } from 'react'
import { Modal, Checkbox, Button, Space, Typography, Radio, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useLayerStore, type Layer } from '../../stores/layerStore'
import { exportLayer as exportLayerApi, parseApiError, type ExportFormat } from '../../services/api'

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

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'shp', label: 'Shapefile' },
  { value: 'gpkg', label: 'GeoPackage' },
  { value: 'kml', label: 'KML' },
  { value: 'csv', label: 'CSV' },
]

export default function ExportLayersModal({ open, onClose, initialLayerId }: Props) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLayerId])

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
    <Modal
      title={t('export.modalTitle')}
      open={open}
      onCancel={onClose}
      closable={!exporting}
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onClose} disabled={exporting}>{t('common.cancel')}</Button>
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
      width={420}
    >
      {layers.length === 0 ? (
        <Typography.Text type="secondary">{t('export.noLayers')}</Typography.Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              {t('export.format')}
            </Typography.Text>
            <Radio.Group
              size="small"
              optionType="button"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              options={FORMATS}
            />
          </div>
          {format === 'shp' && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('export.shpHint')}
            </Typography.Text>
          )}
          <Checkbox
            indeterminate={indeterminate}
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
          >
            {t('export.selectAll')}
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
