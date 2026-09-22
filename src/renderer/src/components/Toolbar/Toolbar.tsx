import { useState } from 'react'
import {
  Button,
  ButtonGroup,
  Intent,
  Menu,
  MenuDivider,
  MenuItem,
  Navbar,
  Popover,
  Tooltip,
} from '@blueprintjs/core'
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
import { useSqlPanelStore } from '../../stores/sqlPanelStore'

interface Props {
  onImport?: () => void
  onExport?: () => void
  onSettings?: () => void
  onWFS?: () => void
  onDrawModeChange?: (mode: DrawMode | 'off') => void
  onOpenProject?: () => void
  onSaveProject?: () => void
  recentProjects?: string[]
  onOpenRecent?: (path: string) => void
}

export default function Toolbar({
  onImport,
  onExport,
  onSettings,
  onWFS,
  onDrawModeChange,
  onOpenProject,
  onSaveProject,
  recentProjects = [],
  onOpenRecent,
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
  const sqlOpen = useSqlPanelStore((s) => s.open)
  const setSqlOpen = useSqlPanelStore((s) => s.setOpen)

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

  const projectMenu = (
    <Menu>
      <MenuItem
        icon="folder-open"
        text={t('toolbar.openProject') + '…'}
        onClick={onOpenProject}
      />
      {recentProjects.length > 0 && <MenuDivider title="最近工程" />}
      {recentProjects.map((p) => (
        <MenuItem
          key={p}
          icon="document"
          text={p.split('/').pop() ?? p}
          labelElement={<span style={{ fontSize: 11, opacity: 0.6 }}>{p}</span>}
          onClick={() => onOpenRecent?.(p)}
        />
      ))}
    </Menu>
  )

  return (
    <Navbar
      style={{
        height: 38,
        minHeight: 38,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        boxShadow: 'none',
        borderBottom: '1px solid var(--color-border, #d9dce0)',
        backgroundColor: '#ffffff',
      }}
    >
      <Navbar.Group style={{ height: '100%', gap: 2 }}>
        {/* Project Group */}
        <ButtonGroup variant="minimal">
          <Popover content={projectMenu} placement="bottom-start">
            <Tooltip content={t('toolbar.openProject')} placement="bottom">
              <Button icon="folder-open" size="small" />
            </Tooltip>
          </Popover>
          <Tooltip content={t('toolbar.saveProject')} placement="bottom">
            <Button icon="floppy-disk" size="small" onClick={onSaveProject} />
          </Tooltip>
        </ButtonGroup>

        <Navbar.Divider />

        {/* Data & Tools Group */}
        <ButtonGroup variant="minimal">
          <Tooltip content={t('toolbar.import')} placement="bottom">
            <Button icon="import" size="small" onClick={onImport} />
          </Tooltip>
          <Tooltip content={t('toolbar.export')} placement="bottom">
            <Button icon="export" size="small" onClick={onExport} />
          </Tooltip>
          <Tooltip content="连接 WFS / OGC API" placement="bottom">
            <Button icon="globe-network" size="small" onClick={onWFS} />
          </Tooltip>
          <Tooltip content="下载地图瓦片" placement="bottom">
            <Button
              icon="cloud-download"
              size="small"
              active={tilesPanelOpen}
              intent={tilesPanelOpen ? Intent.PRIMARY : undefined}
              onClick={() => {
                if (!tilesPanelOpen) {
                  setOsmPanelOpen(false)
                  setAnalysisOpen(false)
                }
                setTilesPanelOpen(!tilesPanelOpen)
              }}
            />
          </Tooltip>
          <Tooltip content={t('osm.menuItem')} placement="bottom">
            <Button
              icon="flash"
              size="small"
              active={osmPanelOpen}
              intent={osmPanelOpen ? Intent.PRIMARY : undefined}
              onClick={() => {
                if (!osmPanelOpen) {
                  setTilesPanelOpen(false)
                  setAnalysisOpen(false)
                }
                setOsmPanelOpen(!osmPanelOpen)
              }}
            />
          </Tooltip>
          <Tooltip content={t('analysis.title')} placement="bottom">
            <Button
              icon="lab-test"
              size="small"
              active={analysisOpen}
              intent={analysisOpen ? Intent.PRIMARY : undefined}
              onClick={() => {
                if (!analysisOpen) {
                  setTilesPanelOpen(false)
                  setOsmPanelOpen(false)
                }
                setAnalysisOpen(!analysisOpen)
              }}
            />
          </Tooltip>
          <Tooltip content={t('attrTable.title')} placement="bottom">
            <Button
              icon="th"
              size="small"
              active={attrTableOpen}
              intent={attrTableOpen ? Intent.PRIMARY : undefined}
              onClick={() => {
                if (!attrTableOpen) setSqlOpen(false)
                setAttrTableOpen(!attrTableOpen)
              }}
            />
          </Tooltip>
          <Tooltip content={t('sql.title')} placement="bottom">
            <Button
              icon="database"
              size="small"
              active={sqlOpen}
              intent={sqlOpen ? Intent.PRIMARY : undefined}
              onClick={() => {
                if (!sqlOpen) setAttrTableOpen(false)
                setSqlOpen(!sqlOpen)
              }}
            />
          </Tooltip>
        </ButtonGroup>

        <Navbar.Divider />

        {/* Draw & Measure Group */}
        <ButtonGroup variant="minimal">
          <Tooltip content={t('toolbar.drawPoint')} placement="bottom">
            <Button
              icon="map-marker"
              size="small"
              active={drawMode === 'point'}
              intent={drawMode === 'point' ? Intent.PRIMARY : undefined}
              onClick={() => handleDraw('point')}
            />
          </Tooltip>
          <Tooltip content={t('toolbar.drawLine')} placement="bottom">
            <Button
              icon="path"
              size="small"
              active={drawMode === 'line'}
              intent={drawMode === 'line' ? Intent.PRIMARY : undefined}
              onClick={() => handleDraw('line')}
            />
          </Tooltip>
          <Tooltip content={t('toolbar.drawPolygon')} placement="bottom">
            <Button
              icon="polygon-filter"
              size="small"
              active={drawMode === 'polygon'}
              intent={drawMode === 'polygon' ? Intent.PRIMARY : undefined}
              onClick={() => handleDraw('polygon')}
            />
          </Tooltip>
          <Tooltip content={t('toolbar.measure')} placement="bottom">
            <Button
              icon="arrows-horizontal"
              size="small"
              active={measureMode === 'distance'}
              intent={measureMode === 'distance' ? Intent.PRIMARY : undefined}
              onClick={() => handleMeasure('distance')}
            />
          </Tooltip>
          <Tooltip content={t('toolbar.measureArea')} placement="bottom">
            <Button
              icon="maximize"
              size="small"
              active={measureMode === 'area'}
              intent={measureMode === 'area' ? Intent.PRIMARY : undefined}
              onClick={() => handleMeasure('area')}
            />
          </Tooltip>
        </ButtonGroup>

        <Navbar.Divider />

        {/* Inspection & Utilities Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip content="位置搜索" placement="bottom">
            <Button
              icon="search"
              variant="minimal"
              size="small"
              onClick={() => setLocationSearchOpen(true)}
            />
          </Tooltip>
          <LocationSearchModal
            open={locationSearchOpen}
            onClose={() => setLocationSearchOpen(false)}
          />

          <BookmarkDropdown />
          <MapExportDropdown />
          <SwipeDropdown />
        </div>

        <Navbar.Divider />

        {/* Live Tracking & Monitoring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip content="车辆定位数据接入" placement="bottom">
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Button
                icon="drive-time"
                variant="minimal"
                size="small"
                active={vehicleConnected}
                intent={vehicleConnected ? Intent.PRIMARY : undefined}
                onClick={() => setVehicleTrackingOpen(true)}
              />
              {vehicleConnected && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#15b374',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </span>
          </Tooltip>
          <VehicleTrackingModal
            open={vehicleTrackingOpen}
            onClose={() => setVehicleTrackingOpen(false)}
          />

          <Tooltip content="飞机定位 — OpenSky Network" placement="bottom">
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Button
                icon="airplane"
                variant="minimal"
                size="small"
                active={flightActive}
                intent={flightActive ? Intent.PRIMARY : undefined}
                onClick={() => setFlightTrackingOpen(true)}
              />
              {flightActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#15b374',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </span>
          </Tooltip>
          <FlightTrackingModal
            open={flightTrackingOpen}
            onClose={() => setFlightTrackingOpen(false)}
          />

          <MonitorDropdown onSettings={onSettings} />
        </div>

        <Navbar.Divider />

        {/* Settings */}
        <Tooltip content={t('settings.title')} placement="bottom">
          <Button icon="cog" variant="minimal" size="small" onClick={onSettings} />
        </Tooltip>
      </Navbar.Group>
    </Navbar>
  )
}
