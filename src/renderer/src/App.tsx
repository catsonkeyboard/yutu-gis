import { useState, useEffect, useRef } from 'react'
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
import OsmExtractModal from './components/OsmExtract/OsmExtractModal'
import FeaturePanel from './components/FeaturePanel/FeaturePanel'
import i18n from './i18n'
import { useSettingsStore } from './stores/settingsStore'

const { Header, Sider, Content, Footer } = Layout

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wfsOpen, setWfsOpen] = useState(false)
  const [osmExtractOpen, setOsmExtractOpen] = useState(false)
  const [osmExtractBounds, setOsmExtractBounds] = useState<[number, number, number, number] | null>(null)
  const [siderWidth, setSiderWidth] = useState(260)
  const resizingRef = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const [rightPanelWidth, setRightPanelWidth] = useState(280)
  const rightResizingRef = useRef(false)
  const rightResizeStartX = useRef(0)
  const rightResizeStartWidth = useRef(0)
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

  const handleSiderResizeStart = (e: React.MouseEvent) => {
    resizingRef.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = siderWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const next = Math.max(180, Math.min(480, resizeStartWidth.current + ev.clientX - resizeStartX.current))
      setSiderWidth(next)
    }
    const onMouseUp = () => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleRightPanelResizeStart = (e: React.MouseEvent) => {
    rightResizingRef.current = true
    rightResizeStartX.current = e.clientX
    rightResizeStartWidth.current = rightPanelWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!rightResizingRef.current) return
      const next = Math.max(200, Math.min(480, rightResizeStartWidth.current - (ev.clientX - rightResizeStartX.current)))
      setRightPanelWidth(next)
    }
    const onMouseUp = () => {
      rightResizingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

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
          width={siderWidth}
          style={{
            background: '#fafafa',
            borderRight: '1px solid #f0f0f0',
            overflow: 'auto',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <LayerPanel onExportLayer={handleExportLayer} />
          <div
            onMouseDown={handleSiderResizeStart}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 4,
              height: '100%',
              cursor: 'col-resize',
              zIndex: 10,
            }}
          />
        </Sider>
        <Content style={{ position: 'relative', overflow: 'hidden' }}>
          <MapCanvas
            onSave={() => handleDrawModeChange('off')}
            onOsmExtract={(bounds) => {
              setOsmExtractBounds(bounds)
              setOsmExtractOpen(true)
            }}
          />
        </Content>
        <Sider
          width={rightPanelWidth}
          style={{
            background: '#fafafa',
            borderLeft: '1px solid #f0f0f0',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <div
            onMouseDown={handleRightPanelResizeStart}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 4,
              height: '100%',
              cursor: 'col-resize',
              zIndex: 10,
            }}
          />
          <FeaturePanel />
        </Sider>
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
      <OsmExtractModal
        open={osmExtractOpen}
        bounds={osmExtractBounds}
        onClose={() => setOsmExtractOpen(false)}
        onImport={(layers) => {
          let lastId = ''
          for (const { fc, name } of layers) {
            const id = nanoid()
            addLayer({ id, name, type: 'geojson', source: fc, visible: true, opacity: 1 })
            lastId = id
          }
          if (lastId) setSelectedLayer(lastId)
          const allFeatures = layers.flatMap((l) => l.fc.features)
          const bounds = getGeoJSONBounds({ type: 'FeatureCollection', features: allFeatures })
          if (bounds) requestFitBounds(bounds)
          const total = allFeatures.length
          if (layers.length === 1) {
            message.success(i18n.t('osm.importSuccess', { name: layers[0].name, count: total }))
          } else {
            message.success(`已导入 ${layers.length} 个图层，共 ${total} 个要素`)
          }
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
