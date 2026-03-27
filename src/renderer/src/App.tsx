import { useState, useEffect } from 'react'
import { Layout, message, Modal, Input, Radio } from 'antd'
import { nanoid } from 'nanoid'
import Toolbar from './components/Toolbar/Toolbar'
import LayerPanel from './components/LayerPanel/LayerPanel'
import MapCanvas from './components/MapCanvas/MapCanvas'
import StatusBar from './components/StatusBar/StatusBar'
import { initApi, importGisFile } from './services/api'
import { useLayerStore } from './stores/layerStore'
import { useMapStore } from './stores/mapStore'
import { useDrawStore, type DrawMode } from './stores/drawStore'
import { getGeoJSONBounds } from './utils/geo'
import SettingsModal from './components/Settings/SettingsModal'
import WFSModal from './components/WFS/WFSModal'
import i18n from './i18n'
import { useSettingsStore } from './stores/settingsStore'

const { Header, Sider, Content, Footer } = Layout

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wfsOpen, setWfsOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveTarget, setSaveTarget] = useState<'current' | 'new'>('new')
  const [pendingLayerName, setPendingLayerName] = useState('')
  const addLayer = useLayerStore((s) => s.addLayer)
  const appendFeatures = useLayerStore((s) => s.appendFeatures)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const { features, setMode, clear } = useDrawStore()
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const setApiKeys = useSettingsStore((s) => s.setApiKeys)

  useEffect(() => {
    initApi().catch(console.error)
  }, [])

  // Load persistent config from ~/.yutugis/config.json on startup
  useEffect(() => {
    window.electronAPI.loadConfig().then((cfg) => {
      setLanguage(cfg.language)
      setApiKeys({ google: cfg.googleMap.apiKey, amap: cfg.amap.apiKey })
      i18n.changeLanguage(cfg.language)
    }).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Listen for menu actions from main process
    const cleanup = window.electronAPI.onMenuAction((action) => {
      if (action === 'import') {
        // handled by Toolbar
      }
    })
    return cleanup
  }, [])

  const handleImport = async () => {
    const filePath = await window.electronAPI.openFileDialog([
      { name: 'GIS Files', extensions: ['geojson', 'json', 'shp', 'kml', 'gpx'] },
      { name: 'All Files', extensions: ['*'] },
    ])
    if (!filePath) return
    try {
      const geojson = await importGisFile(filePath)
      const name = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Layer'
      const id = nanoid()
      addLayer({ id, name, type: 'geojson', source: geojson, visible: true, opacity: 1 })
      setSelectedLayer(id)
      const bounds = getGeoJSONBounds(geojson)
      if (bounds) requestFitBounds(bounds)
      message.success(`已导入：${name}`)
    } catch (e) {
      message.error(`导入失败：${(e as Error).message}`)
    }
  }

  const handleDrawModeChange = (mode: DrawMode | 'off') => {
    if (mode === 'off' && features.length > 0) {
      const { layers, selectedLayerId } = useLayerStore.getState()
      const selectedIsGeoJSON = layers.some((l) => l.id === selectedLayerId && l.type === 'geojson')
      setSaveTarget(selectedIsGeoJSON ? 'current' : 'new')
      const defaultName = `绘制图层 ${new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16)}`
      setPendingLayerName(defaultName)
      setSaveModalOpen(true)
    } else {
      setMode(mode as DrawMode)
    }
  }

  const handleSaveDraw = () => {
    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

    if (saveTarget === 'current') {
      const { layers, selectedLayerId } = useLayerStore.getState()
      const layer = layers.find((l) => l.id === selectedLayerId && l.type === 'geojson')
      if (!layer) return
      appendFeatures(layer.id, features)
      const bounds = getGeoJSONBounds(geojson)
      if (bounds) requestFitBounds(bounds)
      clear()
      setSaveModalOpen(false)
      message.success(`已追加到图层：${layer.name}`)
    } else {
      const id = nanoid()
      addLayer({ id, name: pendingLayerName, type: 'geojson', source: geojson, visible: true, opacity: 1 })
      setSelectedLayer(id)
      const bounds = getGeoJSONBounds(geojson)
      if (bounds) requestFitBounds(bounds)
      clear()
      setSaveModalOpen(false)
      message.success(`已保存图层：${pendingLayerName}`)
    }
  }

  const handleExport = async () => {
    const { layers, selectedLayerId } = useLayerStore.getState()
    const layer = layers.find((l) => l.id === selectedLayerId)
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

  return (
    <Layout style={{ height: '100vh' }}>
      <Header
        style={{
          height: 40,
          lineHeight: '40px',
          padding: 0,
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Toolbar
          onSettings={() => setSettingsOpen(true)}
          onImport={handleImport}
          onExport={handleExport}
          onWFS={() => setWfsOpen(true)}
          onDrawModeChange={handleDrawModeChange}
        />
      </Header>
      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        <Sider
          width={220}
          style={{
            background: '#fafafa',
            borderRight: '1px solid #f0f0f0',
            overflow: 'auto',
          }}
        >
          <LayerPanel onExportLayer={handleExportLayer} />
        </Sider>
        <Content style={{ position: 'relative', overflow: 'hidden' }}>
          <MapCanvas onSave={() => handleDrawModeChange('off')} />
        </Content>
      </Layout>
      <Footer
        style={{
          height: 26,
          padding: '0 12px',
          background: '#f5f5f5',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <StatusBar />
      </Footer>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WFSModal
        open={wfsOpen}
        onClose={() => setWfsOpen(false)}
        onImport={(geojson, name) => {
          const id = nanoid()
          addLayer({ id, name, type: 'geojson', source: geojson, visible: true, opacity: 1 })
          setSelectedLayer(id)
          const bounds = getGeoJSONBounds(geojson)
          if (bounds) requestFitBounds(bounds)
          message.success(`已导入：${name}（${geojson.features.length} 个要素）`)
        }}
      />
      <Modal
        title="保存绘制图层"
        open={saveModalOpen}
        onOk={handleSaveDraw}
        onCancel={() => setSaveModalOpen(false)}
        okText="保存"
        cancelText="继续绘制"
        okButtonProps={{
          disabled: saveTarget === 'new' && !pendingLayerName.trim(),
        }}
      >
        <Radio.Group
          value={saveTarget}
          onChange={(e) => setSaveTarget(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}
        >
          <Radio
            value="current"
            disabled={!useLayerStore.getState().layers.some(
              (l) => l.id === useLayerStore.getState().selectedLayerId && l.type === 'geojson'
            )}
          >
            保存到当前图层
          </Radio>
          <Radio value="new">保存到新图层</Radio>
        </Radio.Group>
        {saveTarget === 'new' && (
          <Input
            value={pendingLayerName}
            onChange={(e) => setPendingLayerName(e.target.value)}
            placeholder="图层名称"
            onPressEnter={handleSaveDraw}
            autoFocus
          />
        )}
      </Modal>
    </Layout>
  )
}
