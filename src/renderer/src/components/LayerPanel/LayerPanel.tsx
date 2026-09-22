import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Classes,
  Icon,
  InputGroup,
  Intent,
  NonIdealState,
  Switch,
  Tooltip,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { useStylePanelStore } from '../../stores/stylePanelStore'
import { getGeoJSONBounds } from '../../utils/geo'

interface Props {
  onExportLayer?: (layerId: string) => void
}

export default function LayerPanel({ onExportLayer }: Props) {
  const { t } = useTranslation()
  const { layers, selectedLayerId, toggleVisible, removeLayer, setSelectedLayer, rename } =
    useLayerStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const commitRename = () => {
    if (editingId && editingName.trim()) rename(editingId, editingName.trim())
    setEditingId(null)
  }
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const openStylePanel = useStylePanelStore((s) => s.openFor)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view when selection changes (e.g. from map click)
  useEffect(() => {
    if (!selectedLayerId || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-layer-id="${selectedLayerId}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedLayerId])

  const handleSelectLayer = (id: string) => {
    setSelectedLayer(id)
    const layer = layers.find((l) => l.id === id)
    if (layer?.type === 'geojson') {
      const bounds = getGeoJSONBounds(layer.source as GeoJSON.FeatureCollection)
      if (bounds) requestFitBounds(bounds)
    } else if (layer?.type === 'raster') {
      const src = layer.source as { bounds?: [number, number, number, number] }
      if (src.bounds) {
        const [west, south, east, north] = src.bounds
        requestFitBounds([
          [west, south],
          [east, north],
        ])
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', userSelect: 'none' }}>
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-border, #d9dce0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--color-bg-panel, #f5f6f8)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t('layer.panel')}</span>
        <span className={Classes.TEXT_MUTED} style={{ fontSize: 11 }}>
          {layers.length}
        </span>
      </div>

      {layers.length === 0 ? (
        <div style={{ padding: '40px 16px', flex: 1, display: 'flex', alignItems: 'center' }}>
          <NonIdealState
            icon="layers"
            title={t('layer.noLayers')}
            description="导入或绘制要素后将在此显示"
            iconSize={32}
          />
        </div>
      ) : (
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            flex: 1,
            padding: '4px 0',
          }}
        >
          {layers.map((layer) => {
            const isSelected = layer.id === selectedLayerId
            const layerIcon = layer.type === 'raster' ? 'media' : 'polygon-filter'

            return (
              <div
                key={layer.id}
                data-layer-id={layer.id}
                onClick={() => handleSelectLayer(layer.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  opacity: layer.visible ? 1 : 0.45,
                  transition: 'background-color 0.12s ease',
                  backgroundColor: isSelected ? 'var(--color-bg-selected, #e4edf6)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--color-primary, #1a6fb5)' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
                className="bp6-menu-item"
              >
                {/* Left: Icon & Layer Name */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Icon
                    icon={layerIcon}
                    size={14}
                    intent={isSelected ? Intent.PRIMARY : undefined}
                    style={{ flexShrink: 0, opacity: 0.8 }}
                  />

                  {editingId === layer.id ? (
                    <InputGroup
                      size="small"
                      value={editingName}
                      autoFocus
                      style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <Tooltip
                      content={`${layer.name}（双击重命名）`}
                      placement="bottom-start"
                      hoverOpenDelay={500}
                    >
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setEditingId(layer.id)
                          setEditingName(layer.name)
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected ? 'var(--color-primary, #1a6fb5)' : 'inherit',
                        }}
                      >
                        {layer.name}
                      </span>
                    </Tooltip>
                  )}
                </div>

                {/* Right: Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    flexShrink: 0,
                    marginLeft: 6,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {layer.type === 'geojson' && (
                    <Tooltip content={t('style.title')} placement="top">
                      <Button
                        size="small"
                        variant="minimal"
                        icon="tint"
                        onClick={() => openStylePanel(layer.id)}
                      />
                    </Tooltip>
                  )}

                  <Tooltip content={layer.visible ? '隐藏图层' : '显示图层'} placement="top">
                    <Switch
                      style={{ marginBottom: 0, marginRight: 2 }}
                      checked={layer.visible}
                      onChange={() => toggleVisible(layer.id)}
                    />
                  </Tooltip>

                  <Tooltip content="导出 GeoJSON" placement="top">
                    <Button
                      size="small"
                      variant="minimal"
                      icon="export"
                      onClick={() => onExportLayer?.(layer.id)}
                    />
                  </Tooltip>

                  <Tooltip content="删除图层" placement="top">
                    <Button
                      size="small"
                      variant="minimal"
                      intent={Intent.DANGER}
                      icon="trash"
                      onClick={() => removeLayer(layer.id)}
                    />
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
