import { useEffect, useRef, useState } from 'react'
import { List, Switch, Button, Typography, Empty, Tooltip, Input } from 'antd'
import { BgColorsOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useLayerStore } from '../../stores/layerStore'
import { useMapStore } from '../../stores/mapStore'
import { useStylePanelStore } from '../../stores/stylePanelStore'
import { getGeoJSONBounds } from '../../utils/geo'

const { Text } = Typography

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
          [east, north]
        ])
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '8px 8px 4px',
          borderBottom: '1px solid #d9dce0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text strong style={{ fontSize: 13 }}>
          {t('layer.panel')}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {layers.length}
        </Text>
      </div>

      {layers.length === 0 ? (
        <Empty
          description={t('layer.noLayers')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 32 }}
        />
      ) : (
        <List
          size="small"
          dataSource={layers}
          style={{ overflow: 'auto', flex: 1 }}
          ref={listRef as React.Ref<HTMLDivElement>}
          renderItem={(layer) => {
            const isSelected = layer.id === selectedLayerId
            return (
              <List.Item
                data-layer-id={layer.id}
                onClick={() => handleSelectLayer(layer.id)}
                style={{
                  padding: '4px 8px',
                  opacity: layer.visible ? 1 : 0.45,
                  transition: 'opacity 0.15s, background 0.1s',
                  background: isSelected ? '#e4edf6' : 'transparent',
                  borderLeft: isSelected ? '2px solid #1a6fb5' : '2px solid transparent',
                  cursor: 'pointer',
                }}
                actions={[
                  ...(layer.type === 'geojson'
                    ? [
                        <Tooltip key="style" title={t('style.title')}>
                          <Button
                            size="small"
                            type="text"
                            icon={<BgColorsOutlined />}
                            onClick={(e) => {
                              e.stopPropagation()
                              openStylePanel(layer.id)
                            }}
                          />
                        </Tooltip>,
                      ]
                    : []),
                  <Tooltip key="vis" title={layer.visible ? '隐藏' : '显示'}>
                    <Switch
                      size="small"
                      checked={layer.visible}
                      onChange={(_, e) => {
                        e?.stopPropagation()
                        toggleVisible(layer.id)
                      }}
                    />
                  </Tooltip>,
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
                  <Tooltip key="del" title="删除图层">
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLayer(layer.id)
                      }}
                    />
                  </Tooltip>,
                ]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <EyeOutlined style={{ color: isSelected ? '#1a6fb5' : '#646a73', flexShrink: 0 }} />
                  {editingId === layer.id ? (
                    <Input
                      size="small"
                      value={editingName}
                      autoFocus
                      style={{ fontSize: 12, flex: 1, minWidth: 0 }}
                      onChange={(e) => setEditingName(e.target.value)}
                      onPressEnter={commitRename}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <Tooltip title={`${layer.name}（双击重命名）`}>
                      <Text
                        ellipsis
                        strong={isSelected}
                        style={{ fontSize: 12, flex: 1, minWidth: 0, color: isSelected ? '#1a6fb5' : undefined }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          setEditingId(layer.id)
                          setEditingName(layer.name)
                        }}
                      >
                        {layer.name}
                      </Text>
                    </Tooltip>
                  )}
                </div>
              </List.Item>
            )
          }}
        />
      )}
    </div>
  )
}
