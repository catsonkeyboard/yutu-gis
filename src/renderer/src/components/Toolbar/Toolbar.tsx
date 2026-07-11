import { useState } from 'react'
import { Button, Space, Divider, Tooltip, Badge } from 'antd'
import {
  FolderOpenOutlined,
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  SettingOutlined,
  ApiOutlined,
  EnvironmentOutlined,
  LineOutlined,
  BorderOutlined,
  SearchOutlined,
  CarOutlined,
  CloudOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  TableOutlined,
  ExperimentOutlined,
  ColumnWidthOutlined,
  ExpandOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useDrawStore, type DrawMode } from '../../stores/drawStore'
import LocationSearchModal from './LocationSearchModal'
import BookmarkDropdown from './BookmarkDropdown'
import MapExportDropdown from './MapExportDropdown'
import SwipeDropdown from './SwipeDropdown'
import MonitorDropdown from './MonitorDropdown'
import VehicleTrackingModal from '../VehicleTracking/VehicleTrackingModal'
import FlightTrackingModal from '../FlightTracking/FlightTrackingModal'
import { useVehicleStore } from '../../stores/vehicleStore'
import { useFlightStore } from '../../stores/flightStore'
import { useTilesPanelStore } from '../../stores/tilesPanelStore'
import { useOsmPanelStore } from '../../stores/osmPanelStore'
import { useAttributeTableStore } from '../../stores/attributeTableStore'
import { useAnalysisPanelStore } from '../../stores/analysisPanelStore'
import { useMeasureStore, type MeasureMode } from '../../stores/measureStore'

interface Props {
  onImport?: () => void
  onExport?: () => void
  onSettings?: () => void
  onWFS?: () => void
  onDrawModeChange?: (mode: DrawMode | 'off') => void
  onOpenProject?: () => void
  onSaveProject?: () => void
}

export default function Toolbar({
  onImport,
  onExport,
  onSettings,
  onWFS,
  onDrawModeChange,
  onOpenProject,
  onSaveProject,
}: Props) {
  const { t } = useTranslation()
  const drawMode = useDrawStore((s) => s.drawMode)
  const [locationSearchOpen, setLocationSearchOpen] = useState(false)
  const [vehicleTrackingOpen, setVehicleTrackingOpen] = useState(false)
  const [flightTrackingOpen, setFlightTrackingOpen] = useState(false)
  const vehicleConnected = useVehicleStore((s) => s.connected)
  const flightActive = useFlightStore((s) => s.active)
  const tilesPanelOpen = useTilesPanelStore((s) => s.open)
  const setTilesPanelOpen = useTilesPanelStore((s) => s.setOpen)
  const osmPanelOpen = useOsmPanelStore((s) => s.open)
  const setOsmPanelOpen = useOsmPanelStore((s) => s.setOpen)
  const attrTableOpen = useAttributeTableStore((s) => s.open)
  const setAttrTableOpen = useAttributeTableStore((s) => s.setOpen)
  const analysisOpen = useAnalysisPanelStore((s) => s.open)
  const setAnalysisOpen = useAnalysisPanelStore((s) => s.setOpen)

  const measureMode = useMeasureStore((s) => s.mode)
  const setMeasureMode = useMeasureStore((s) => s.setMode)

  const handleDraw = (mode: DrawMode) => {
    setMeasureMode('off') // drawing and measuring are mutually exclusive
    onDrawModeChange?.(drawMode === mode ? 'off' : mode)
  }

  const handleMeasure = (mode: Exclude<MeasureMode, 'off'>) => {
    if (drawMode !== 'off') onDrawModeChange?.('off')
    setMeasureMode(measureMode === mode ? 'off' : mode)
  }

  return (
    <Space style={{ padding: '0 8px', height: '100%' }} size={4}>
      <Tooltip title={t('toolbar.openProject')}>
        <Button icon={<FolderOpenOutlined />} type="text" size="small" onClick={onOpenProject} />
      </Tooltip>
      <Tooltip title={t('toolbar.saveProject')}>
        <Button icon={<SaveOutlined />} type="text" size="small" onClick={onSaveProject} />
      </Tooltip>
      <Divider type="vertical" />
      <Tooltip title={t('toolbar.import')}>
        <Button icon={<ImportOutlined />} type="text" size="small" onClick={onImport} />
      </Tooltip>
      <Tooltip title={t('toolbar.export')}>
        <Button icon={<ExportOutlined />} type="text" size="small" onClick={onExport} />
      </Tooltip>
      <Tooltip title="连接 WFS / OGC API">
        <Button icon={<ApiOutlined />} type="text" size="small" onClick={onWFS} />
      </Tooltip>
      <Tooltip title="下载地图瓦片">
        <Button
          icon={<DownloadOutlined />}
          type={tilesPanelOpen ? 'primary' : 'text'}
          size="small"
          onClick={() => {
            if (!tilesPanelOpen) {
              setOsmPanelOpen(false)
              setAnalysisOpen(false)
            }
            setTilesPanelOpen(!tilesPanelOpen)
          }}
        />
      </Tooltip>
      <Tooltip title={t('osm.menuItem')}>
        <Button
          icon={<ThunderboltOutlined />}
          type={osmPanelOpen ? 'primary' : 'text'}
          size="small"
          onClick={() => {
            if (!osmPanelOpen) {
              setTilesPanelOpen(false)
              setAnalysisOpen(false)
            }
            setOsmPanelOpen(!osmPanelOpen)
          }}
        />
      </Tooltip>
      <Tooltip title={t('analysis.title')}>
        <Button
          icon={<ExperimentOutlined />}
          type={analysisOpen ? 'primary' : 'text'}
          size="small"
          onClick={() => {
            if (!analysisOpen) {
              setTilesPanelOpen(false)
              setOsmPanelOpen(false)
            }
            setAnalysisOpen(!analysisOpen)
          }}
        />
      </Tooltip>
      <Tooltip title={t('attrTable.title')}>
        <Button
          icon={<TableOutlined />}
          type={attrTableOpen ? 'primary' : 'text'}
          size="small"
          onClick={() => setAttrTableOpen(!attrTableOpen)}
        />
      </Tooltip>
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
      <Tooltip title={t('toolbar.measure')}>
        <Button
          icon={<ColumnWidthOutlined />}
          type={measureMode === 'distance' ? 'primary' : 'text'}
          size="small"
          onClick={() => handleMeasure('distance')}
        />
      </Tooltip>
      <Tooltip title={t('toolbar.measureArea')}>
        <Button
          icon={<ExpandOutlined />}
          type={measureMode === 'area' ? 'primary' : 'text'}
          size="small"
          onClick={() => handleMeasure('area')}
        />
      </Tooltip>
      <Divider type="vertical" />
      <Tooltip title="位置搜索">
        <Button
          icon={<SearchOutlined />}
          type="text"
          size="small"
          onClick={() => setLocationSearchOpen(true)}
        />
      </Tooltip>
      <LocationSearchModal open={locationSearchOpen} onClose={() => setLocationSearchOpen(false)} />
      <BookmarkDropdown />
      <MapExportDropdown />
      <SwipeDropdown />
      <Divider type="vertical" />
      <Tooltip title="车辆定位数据接入">
        <Badge dot={vehicleConnected} offset={[-2, 2]} status="success">
          <Button
            icon={<CarOutlined />}
            type={vehicleConnected ? 'primary' : 'text'}
            size="small"
            onClick={() => setVehicleTrackingOpen(true)}
          />
        </Badge>
      </Tooltip>
      <VehicleTrackingModal open={vehicleTrackingOpen} onClose={() => setVehicleTrackingOpen(false)} />
      <Tooltip title="飞机定位 — OpenSky Network">
        <Badge dot={flightActive} offset={[-2, 2]} status="success">
          <Button
            icon={<CloudOutlined />}
            type={flightActive ? 'primary' : 'text'}
            size="small"
            onClick={() => setFlightTrackingOpen(true)}
          />
        </Badge>
      </Tooltip>
      <FlightTrackingModal open={flightTrackingOpen} onClose={() => setFlightTrackingOpen(false)} />
      <MonitorDropdown onSettings={onSettings} />
      <Divider type="vertical" />
      <Tooltip title={t('settings.title')}>
        <Button icon={<SettingOutlined />} type="text" size="small" onClick={onSettings} />
      </Tooltip>
    </Space>
  )
}
