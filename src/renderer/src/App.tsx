import { useState, useEffect, useRef } from 'react'
import { Layout, message, Modal, Input, Radio } from 'antd'
import { nanoid } from 'nanoid'
import Toolbar from './components/Toolbar/Toolbar'
import LayerPanel from './components/LayerPanel/LayerPanel'
import MapCanvas from './components/MapCanvas/MapCanvas'
import StatusBar from './components/StatusBar/StatusBar'
import {
  initApi, importGisFile, importGisFileFromFile, importPbfFile, parseApiError,
  type ImportedLayer
} from './services/api'
import { importOfflineMap } from './utils/importOfflineMap'
import { serializeProject, loadProject } from './services/project'
import { useLayerStore } from './stores/layerStore'
import { useMapStore } from './stores/mapStore'
import { useDrawStore, type DrawMode } from './stores/drawStore'
import { getGeoJSONBounds } from './utils/geo'
import SettingsModal from './components/Settings/SettingsModal'
import WFSModal from './components/WFS/WFSModal'
import ExportLayersModal from './components/Toolbar/ExportLayersModal'
import FeaturePanel from './components/FeaturePanel/FeaturePanel'
import AttributeTablePanel from './components/AttributeTable/AttributeTablePanel'
import { useAttributeTableStore } from './stores/attributeTableStore'
import i18n from './i18n'
import { useSettingsStore } from './stores/settingsStore'
import { useBookmarkStore, type Bookmark } from './stores/bookmarkStore'

const { Header, Sider, Content, Footer } = Layout

const ALLOWED_DROP_EXTENSIONS = new Set(['geojson', 'json', 'kml', 'gpx'])

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wfsOpen, setWfsOpen] = useState(false)
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
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [pendingImportLayers, setPendingImportLayers] = useState<ImportedLayer[]>([])
  const [importMode, setImportMode] = useState<'merge' | 'split'>('merge')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportLayerId, setExportLayerId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const addLayer = useLayerStore((s) => s.addLayer)
  const appendFeatures = useLayerStore((s) => s.appendFeatures)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const { features, setMode, clear, drawMode } = useDrawStore()
  const attrTableOpen = useAttributeTableStore((s) => s.open)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const setApiKeys = useSettingsStore((s) => s.setApiKeys)
  const setDownloadDir = useSettingsStore((s) => s.setDownloadDir)

  useEffect(() => {
    initApi().catch(console.error)
  }, [])

  // Load persistent config from ~/.yutugis/config.json on startup
  useEffect(() => {
    window.electronAPI
      .loadConfig()
      .then((cfg) => {
        setLanguage(cfg.language)
        setApiKeys({
          google: cfg.googleMap.apiKey,
          amap: cfg.amap.apiKey,
          openweather: cfg.openWeather?.apiKey ?? '',
          firms: cfg.firms?.apiKey ?? '',
          waqi: cfg.waqi?.apiKey ?? '',
        })
        setDownloadDir(cfg.download.dir)
        useBookmarkStore.getState().setAll(((cfg as { bookmarks?: Bookmark[] }).bookmarks ?? []))
        i18n.changeLanguage(cfg.language)
      })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Listen for menu actions from main process
    const cleanup = window.electronAPI.onMenuAction((action) => {
      if (action === 'import') handleImport()
      else if (action === 'export') setExportOpen(true)
      else if (action === 'open') handleOpenProject()
      else if (action === 'save') handleSaveProject()
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSiderResizeStart = (e: React.MouseEvent) => {
    resizingRef.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = siderWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const next = Math.max(
        180,
        Math.min(480, resizeStartWidth.current + ev.clientX - resizeStartX.current)
      )
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
      const next = Math.max(
        200,
        Math.min(480, rightResizeStartWidth.current - (ev.clientX - rightResizeStartX.current))
      )
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

  const featName = (feat: GeoJSON.Feature, fallback: string): string =>
    ((feat.properties?.name || feat.properties?.Name) as string | undefined)?.trim() || fallback

  const applyImport = (layers: ImportedLayer[], mode: 'merge' | 'split') => {
    const allFeatures = layers.flatMap((l) => l.geojson.features)
    if (mode === 'merge') {
      const name =
        allFeatures.length === 1 ? featName(allFeatures[0], layers[0].name) : layers[0].name
      const id = nanoid()
      addLayer({
        id,
        name,
        type: 'geojson',
        source: { type: 'FeatureCollection', features: allFeatures },
        visible: true,
        opacity: 1
      })
      setSelectedLayer(id)
      message.success(`已导入：${name}（${allFeatures.length} 个要素）`)
    } else {
      let lastId = ''
      allFeatures.forEach((feat, i) => {
        const name = featName(feat, `要素 ${i + 1}`)
        const id = nanoid()
        addLayer({
          id,
          name,
          type: 'geojson',
          source: { type: 'FeatureCollection', features: [feat] },
          visible: true,
          opacity: 1
        })
        lastId = id
      })
      if (lastId) setSelectedLayer(lastId)
      message.success(`已导入 ${allFeatures.length} 个图层`)
    }
    const combined: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: allFeatures }
    const bounds = getGeoJSONBounds(combined)
    if (bounds) requestFitBounds(bounds)
  }

  // Shared tail of every vector import: small imports merge directly,
  // larger ones go through the merge/split dialog
  const processImportedLayers = (layers: ImportedLayer[]) => {
    const totalFeatures = layers.reduce((sum, l) => sum + l.geojson.features.length, 0)
    if (totalFeatures <= 1) {
      applyImport(layers, 'merge')
      return
    }
    setImportMode('merge')
    setPendingImportLayers(layers)
    setImportDialogOpen(true)
  }

  const handleImport = async () => {
    const filePath = await window.electronAPI.openFileDialog([
      { name: 'GIS Files', extensions: ['geojson', 'json', 'shp', 'kml', 'gpx', 'pbf', 'mbtiles'] },
      { name: 'OSM PBF', extensions: ['pbf'] },
      { name: '离线地图 (MBTiles / 瓦片目录 metadata.json)', extensions: ['mbtiles', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ])
    if (!filePath) return
    // Offline maps: .mbtiles files, or a tile directory picked via its metadata.json
    if (/\.mbtiles$/i.test(filePath)) {
      await importOfflineMap(filePath)
      return
    }
    if (/(^|[/\\])metadata\.json$/i.test(filePath)) {
      await importOfflineMap(filePath.replace(/[/\\]metadata\.json$/i, ''))
      return
    }
    // OSM PBF extracts are parsed server-side from disk (no upload)
    if (/\.pbf$/i.test(filePath)) {
      try {
        const { layers, truncated } = await importPbfFile(filePath)
        if (truncated) {
          message.warning('PBF 数据量过大，仅加载前 100,000 个要素，建议使用更小的区域提取')
        }
        processImportedLayers(layers)
      } catch (e) {
        message.error(`导入失败：${parseApiError(e)}`)
      }
      return
    }
    try {
      const layers = await importGisFile(filePath)
      processImportedLayers(layers)
    } catch (e) {
      message.error(`导入失败：${(e as Error).message}`)
    }
  }

  const handleFileDrop = async (file: File) => {
    if (drawMode !== 'off') return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    // SHP requires companion files (.dbf, .prj, etc.) — drag-drop only gets the single file
    if (ext === 'shp') {
      message.error('SHP 格式需通过工具栏导入（需要 .dbf 等附属文件）')
      return
    }
    if (!ALLOWED_DROP_EXTENSIONS.has(ext)) {
      message.error('不支持的文件类型，请使用 GeoJSON / KML / GPX')
      return
    }
    try {
      const layers = await importGisFileFromFile(file)
      processImportedLayers(layers)
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
      addLayer({
        id,
        name: pendingLayerName,
        type: 'geojson',
        source: geojson,
        visible: true,
        opacity: 1
      })
      setSelectedLayer(id)
      const bounds = getGeoJSONBounds(geojson)
      if (bounds) requestFitBounds(bounds)
      clear()
      setSaveModalOpen(false)
      message.success(`已保存图层：${pendingLayerName}`)
    }
  }

  const handleSaveProject = async () => {
    const filePath = await window.electronAPI.saveFileDialog([
      { name: 'YutuGIS 工程', extensions: ['yutugis'] }
    ])
    if (!filePath) return
    try {
      await window.electronAPI.writeFile(filePath, JSON.stringify(serializeProject()))
      message.success(`已保存工程：${filePath.split('/').pop()}`)
    } catch (e) {
      message.error(`保存工程失败：${(e as Error).message}`)
    }
  }

  const handleOpenProject = async () => {
    const filePath = await window.electronAPI.openFileDialog([
      { name: 'YutuGIS 工程', extensions: ['yutugis'] }
    ])
    if (!filePath) return
    if (useLayerStore.getState().layers.length > 0) {
      const ok = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '打开工程',
          content: '打开工程将替换当前所有图层，是否继续？',
          okText: '继续',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        })
      })
      if (!ok) return
    }
    try {
      const buffer = await window.electronAPI.readFile(filePath)
      const json = JSON.parse(new TextDecoder().decode(buffer))
      const { warnings } = await loadProject(json)
      warnings.forEach((w) => message.warning(w))
      message.success('工程已打开')
    } catch (e) {
      message.error(`打开工程失败：${(e as Error).message}`)
    }
  }

  const handleExportLayer = (layerId: string) => {
    setExportLayerId(layerId)
    setExportOpen(true)
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Header
        style={{
          height: 36,
          lineHeight: '36px',
          padding: 0,
          background: '#ffffff',
          borderBottom: '1px solid #d9dce0'
        }}
      >
        <Toolbar
          onSettings={() => setSettingsOpen(true)}
          onImport={handleImport}
          onOpenProject={handleOpenProject}
          onSaveProject={handleSaveProject}
          onExport={() => setExportOpen(true)}
          onWFS={() => setWfsOpen(true)}
          onDrawModeChange={handleDrawModeChange}
        />
      </Header>
      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        <Sider
          width={siderWidth}
          style={{
            background: '#f5f6f8',
            borderRight: '1px solid #d9dce0',
            overflow: 'auto',
            position: 'relative',
            flexShrink: 0
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
              zIndex: 10
            }}
          />
        </Sider>
        <Content
          style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            // Only clear when leaving the Content element itself, not its children
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsDragOver(false)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            const files = e.dataTransfer.files
            if (files.length === 0) return
            if (files.length > 1) {
              message.warning('每次只能拖入一个文件，已导入第一个')
            }
            handleFileDrop(files[0])
          }}
        >
          {isDragOver && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                background: 'rgba(26, 111, 181, 0.06)',
                border: '2px dashed #1a6fb5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  padding: '6px 16px',
                  borderRadius: 2,
                  fontSize: 13,
                  color: '#1a6fb5',
                  fontWeight: 500,
                  border: '1px solid #d9dce0'
                }}
              >
                松开以导入
              </span>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <MapCanvas onSave={() => handleDrawModeChange('off')} />
          </div>
          {attrTableOpen && <AttributeTablePanel />}
        </Content>
        <Sider
          width={rightPanelWidth}
          style={{
            background: '#f5f6f8',
            borderLeft: '1px solid #d9dce0',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0
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
              zIndex: 10
            }}
          />
          <FeaturePanel />
        </Sider>
      </Layout>
      <Footer
        style={{
          height: 24,
          padding: '0 12px',
          background: '#f5f6f8',
          borderTop: '1px solid #d9dce0',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <StatusBar />
      </Footer>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ExportLayersModal
        open={exportOpen}
        initialLayerId={exportLayerId}
        onClose={() => {
          setExportOpen(false)
          setExportLayerId(null)
        }}
      />
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
        title="导入选项"
        open={importDialogOpen}
        onOk={() => {
          setImportDialogOpen(false)
          applyImport(pendingImportLayers, importMode)
          setPendingImportLayers([])
        }}
        onCancel={() => {
          setImportDialogOpen(false)
          setPendingImportLayers([])
        }}
        okText="确定"
        cancelText="取消"
      >
        {(() => {
          const total = pendingImportLayers.reduce((s, l) => s + l.geojson.features.length, 0)
          return (
            <Radio.Group
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <Radio value="merge">合并为一个图层（{total} 个要素）</Radio>
              <Radio value="split">每个要素单独一个图层（创建 {total} 个图层）</Radio>
            </Radio.Group>
          )
        })()}
      </Modal>
      <Modal
        title="保存绘制图层"
        open={saveModalOpen}
        onOk={handleSaveDraw}
        onCancel={() => setSaveModalOpen(false)}
        okText="保存"
        cancelText="继续绘制"
        okButtonProps={{
          disabled: saveTarget === 'new' && !pendingLayerName.trim()
        }}
      >
        <Radio.Group
          value={saveTarget}
          onChange={(e) => setSaveTarget(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}
        >
          <Radio
            value="current"
            disabled={
              !useLayerStore
                .getState()
                .layers.some(
                  (l) => l.id === useLayerStore.getState().selectedLayerId && l.type === 'geojson'
                )
            }
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
