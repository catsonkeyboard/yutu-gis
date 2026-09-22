import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Callout,
  Checkbox,
  ControlGroup,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  InputGroup,
  Intent,
  NumericInput,
  ProgressBar,
  SegmentedControl,
} from '@blueprintjs/core'
import {
  wfsGetLayers,
  wfsGetFeatures,
  ogcGetCollections,
  ogcGetFeatures,
  type WFSLayer,
  type OGCCollection,
} from '../../services/api'

type ServiceType = 'wfs' | 'ogc'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (geojson: GeoJSON.FeatureCollection, name: string) => void
}

export default function WFSModal({ open, onClose, onImport }: Props): ReactElement {
  const [serviceType, setServiceType] = useState<ServiceType>('wfs')
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [wfsLayers, setWfsLayers] = useState<WFSLayer[]>([])
  const [ogcCollections, setOgcCollections] = useState<OGCCollection[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [layerSearch, setLayerSearch] = useState('')
  const [customItem, setCustomItem] = useState('')
  const [maxFeatures, setMaxFeatures] = useState<number>(1000)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const handleGetList = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('请输入服务地址')
      return
    }
    setFetching(true)
    setError(null)
    try {
      if (serviceType === 'wfs') {
        const layers = await wfsGetLayers(trimmed)
        setWfsLayers(layers)
        setSelectedItems(new Set())
      } else {
        const cols = await ogcGetCollections(trimmed)
        setOgcCollections(cols)
        setSelectedItems(new Set())
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const handleAddCustom = () => {
    const trimmed = customItem.trim()
    if (!trimmed) return
    setSelectedItems((prev) => new Set(prev).add(trimmed))
    setCustomItem('')
  }

  const toggleItem = (key: string, checked: boolean) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handleImport = async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError('请输入服务地址')
      return
    }
    if (selectedItems.size === 0) {
      setError('请至少选择或添加一个图层/集合')
      return
    }

    setError(null)
    const items = Array.from(selectedItems).map((key) => {
      if (serviceType === 'wfs') {
        const found = wfsLayers.find((l) => l.name === key)
        return { key, name: found?.title || key.split(':').pop() || key }
      } else {
        const found = ogcCollections.find((c) => c.id === key)
        return { key, name: found?.title || key }
      }
    })

    setProgress({ current: 0, total: items.length })
    const errors: string[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setProgress({ current: i + 1, total: items.length })
      try {
        const geojson =
          serviceType === 'wfs'
            ? await wfsGetFeatures(trimmedUrl, item.key, maxFeatures)
            : await ogcGetFeatures(trimmedUrl, item.key, maxFeatures)
        onImport(geojson, item.name)
      } catch (e) {
        errors.push(`${item.name}: ${(e as Error).message}`)
      }
    }

    setProgress(null)

    if (errors.length > 0) {
      setError(errors.join('\n'))
    } else {
      handleClose()
    }
  }

  const handleClose = () => {
    setUrl('')
    setWfsLayers([])
    setOgcCollections([])
    setSelectedItems(new Set())
    setLayerSearch('')
    setCustomItem('')
    setError(null)
    setProgress(null)
    onClose()
  }

  const importing = progress !== null

  const displayedLayers =
    serviceType === 'wfs'
      ? wfsLayers.filter(
          (l) =>
            l.name.toLowerCase().includes(layerSearch.toLowerCase()) ||
            l.title.toLowerCase().includes(layerSearch.toLowerCase())
        )
      : ogcCollections.filter(
          (c) =>
            c.id.toLowerCase().includes(layerSearch.toLowerCase()) ||
            c.title.toLowerCase().includes(layerSearch.toLowerCase())
        )

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="连接 WFS / OGC API Features"
      icon="link"
      style={{ width: 540 }}
    >
      <DialogBody>
        <FormGroup label="接口类型">
          <SegmentedControl
            value={serviceType}
            onValueChange={(val) => {
              setServiceType(val as ServiceType)
              setWfsLayers([])
              setOgcCollections([])
              setSelectedItems(new Set())
              setError(null)
            }}
            options={[
              { value: 'wfs', label: 'WFS 1.x / 2.x' },
              { value: 'ogc', label: 'OGC API Features' },
            ]}
          />
        </FormGroup>

        <FormGroup label="服务地址" helperText={serviceType === 'wfs' ? '如 https://example.com/geoserver/ows' : '如 https://example.com/ogcapi'}>
          <ControlGroup fill>
            <InputGroup
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={serviceType === 'wfs' ? 'https://example.com/geoserver/ows' : 'https://example.com/ogcapi'}
              disabled={importing}
            />
            <Button
              icon="refresh"
              text={serviceType === 'wfs' ? '获取图层' : '获取集合'}
              loading={fetching}
              disabled={importing}
              onClick={handleGetList}
            />
          </ControlGroup>
        </FormGroup>

        {/* Layer list / selection */}
        <FormGroup
          label={
            <span>
              {serviceType === 'wfs' ? '图层名称 (TypeName)' : '集合 ID (Collection)'}
              <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 11, color: 'var(--color-text-secondary, #8f959e)' }}>
                已选 {selectedItems.size} 项，可多选
              </span>
            </span>
          }
        >
          {displayedLayers.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <InputGroup
                small
                leftIcon="search"
                placeholder="搜索图层..."
                value={layerSearch}
                onChange={(e) => setLayerSearch(e.target.value)}
              />
            </div>
          )}

          {displayedLayers.length > 0 ? (
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                border: '1px solid #d9dce0',
                borderRadius: 3,
                padding: '6px 8px',
                background: '#fff',
              }}
            >
              {displayedLayers.map((item) => {
                const key = 'name' in item ? item.name : item.id
                const title = item.title
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '3px 0',
                    }}
                  >
                    <Checkbox
                      checked={selectedItems.has(key)}
                      onChange={(e) => toggleItem(key, (e.target as HTMLInputElement).checked)}
                      style={{ margin: 0 }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{key}</span>
                      {title && title !== key && (
                        <span style={{ fontSize: 11, color: '#8f959e', marginLeft: 6 }}>
                          ({title})
                        </span>
                      )}
                    </Checkbox>
                  </div>
                )
              })}
            </div>
          ) : (
            <ControlGroup fill>
              <InputGroup
                placeholder={serviceType === 'wfs' ? '输入图层名后回车添加' : '输入集合 ID 后回车添加'}
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustom()
                  }
                }}
              />
              <Button icon="plus" text="添加" onClick={handleAddCustom} />
            </ControlGroup>
          )}

          {selectedItems.size > 0 && displayedLayers.length === 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {Array.from(selectedItems).map((key) => (
                <span
                  key={key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    background: '#e4edf6',
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}
                >
                  {key}
                  <Button
                    small
                    minimal
                    icon="cross"
                    onClick={() => toggleItem(key, false)}
                    style={{ minWidth: 14, minHeight: 14, padding: 0 }}
                  />
                </span>
              ))}
            </div>
          )}
        </FormGroup>

        <FormGroup label="每个图层最大要素数">
          <NumericInput
            min={1}
            max={100000}
            value={maxFeatures}
            onValueChange={(val) => setMaxFeatures(val)}
            style={{ width: 160 }}
          />
        </FormGroup>

        {importing && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>导入进度</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <ProgressBar value={progress.total ? progress.current / progress.total : 0} />
          </div>
        )}

        {error && (
          <Callout intent={Intent.DANGER} style={{ marginTop: 12 }}>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{error}</pre>
          </Callout>
        )}
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={handleClose} disabled={importing} text="取消" />
            <Button
              intent={Intent.PRIMARY}
              loading={importing}
              disabled={selectedItems.size === 0}
              onClick={handleImport}
              text={importing ? `导入中 ${progress.current}/${progress.total}` : '导入图层'}
            />
          </>
        }
      />
    </Dialog>
  )
}
