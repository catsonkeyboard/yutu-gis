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
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useDrawStore, type DrawMode } from '../../stores/drawStore'
import LocationSearchModal from './LocationSearchModal'
import VehicleTrackingModal from '../VehicleTracking/VehicleTrackingModal'
import FlightTrackingModal from '../FlightTracking/FlightTrackingModal'
import { useVehicleStore } from '../../stores/vehicleStore'
import { useFlightStore } from '../../stores/flightStore'

interface Props {
  onImport?: () => void
  onExport?: () => void
  onSettings?: () => void
  onWFS?: () => void
  onDrawModeChange?: (mode: DrawMode | 'off') => void
}

export default function Toolbar({ onImport, onExport, onSettings, onWFS, onDrawModeChange }: Props) {
  const { t } = useTranslation()
  const drawMode = useDrawStore((s) => s.drawMode)
  const [locationSearchOpen, setLocationSearchOpen] = useState(false)
  const [vehicleTrackingOpen, setVehicleTrackingOpen] = useState(false)
  const [flightTrackingOpen, setFlightTrackingOpen] = useState(false)
  const vehicleConnected = useVehicleStore((s) => s.connected)
  const flightActive = useFlightStore((s) => s.active)

  const handleDraw = (mode: DrawMode) => {
    onDrawModeChange?.(drawMode === mode ? 'off' : mode)
  }

  return (
    <Space style={{ padding: '0 8px', height: '100%' }} size={4}>
      <Tooltip title={t('toolbar.open')}>
        <Button icon={<FolderOpenOutlined />} type="text" size="small" />
      </Tooltip>
      <Tooltip title={t('toolbar.save')}>
        <Button icon={<SaveOutlined />} type="text" size="small" />
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
      <Divider type="vertical" />
      <Tooltip title={t('settings.title')}>
        <Button icon={<SettingOutlined />} type="text" size="small" onClick={onSettings} />
      </Tooltip>
    </Space>
  )
}
