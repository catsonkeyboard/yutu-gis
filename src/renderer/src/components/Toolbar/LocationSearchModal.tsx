import { useState } from 'react'
import type { ReactElement } from 'react'
import { nanoid } from 'nanoid'
import {
  Button,
  ControlGroup,
  Dialog,
  DialogBody,
  FormGroup,
  Icon,
  InputGroup,
  Intent,
  Tab,
  Tabs,
  Tag,
} from '@blueprintjs/core'
import { searchAirportByIata } from '../../services/airports'
import { useMapStore } from '../../stores/mapStore'
import { useLayerStore } from '../../stores/layerStore'
import { message } from '../../utils/toaster'

interface GeocodingResult {
  name: string
  displayName: string
  lat: number
  lon: number
  bbox: [number, number, number, number] // [south, north, west, east] from Nominatim
  type: string
  importance: number
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function LocationSearchModal({ open, onClose }: Props): ReactElement {
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)
  const addLayer = useLayerStore((s) => s.addLayer)
  const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer)

  const [activeTab, setActiveTab] = useState<string>('city')
  const [iataValue, setIataValue] = useState('')
  const [latValue, setLatValue] = useState('')
  const [lonValue, setLonValue] = useState('')

  const [cityQuery, setCityQuery] = useState('')
  const [cityLoading, setCityLoading] = useState(false)
  const [cityResults, setCityResults] = useState<GeocodingResult[]>([])
  const [citySearched, setCitySearched] = useState(false)

  const handleClose = () => {
    setIataValue('')
    setLatValue('')
    setLonValue('')
    setCityQuery('')
    setCityResults([])
    setCitySearched(false)
    onClose()
  }

  const handleIataSearch = () => {
    const code = iataValue.trim().toUpperCase()
    if (code.length !== 3) {
      message.warning('请输入 3 位 IATA 机场代码')
      return
    }
    try {
      const airport = searchAirportByIata(code)
      const [west, south, east, north] = airport.bbox
      requestFitBounds([
        [west, south],
        [east, north],
      ])
      message.success(`已跳转至 ${airport.name}（${airport.iata}）`)
      handleClose()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCoordJump = () => {
    const lat = parseFloat(latValue.trim())
    const lon = parseFloat(lonValue.trim())
    if (isNaN(lat) || lat < -90 || lat > 90) {
      message.warning('纬度范围为 -90 ~ 90')
      return
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      message.warning('经度范围为 -180 ~ 180')
      return
    }
    const id = nanoid()
    const label = `坐标点 ${lat}, ${lon}`
    addLayer({
      id,
      name: label,
      type: 'geojson',
      source: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: { name: label, lat, lon },
          },
        ],
      },
      visible: true,
      opacity: 1,
    })
    setSelectedLayer(id)
    const delta = 0.01
    requestFitBounds([
      [lon - delta, lat - delta],
      [lon + delta, lat + delta],
    ])
    message.success(`已跳转至 ${lat}, ${lon}`)
    handleClose()
  }

  const handleCitySearch = async () => {
    const query = cityQuery.trim()
    if (!query) {
      message.warning('请输入城市或地名')
      return
    }
    setCityLoading(true)
    setCitySearched(true)
    try {
      const results = await window.electronAPI.geocodeSearch(query, 8)
      setCityResults(results)
      if (results.length === 0) {
        message.info('未找到匹配的地名')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`搜索失败：${msg}`)
      setCityResults([])
    } finally {
      setCityLoading(false)
    }
  }

  const handleCitySelect = (result: GeocodingResult) => {
    // Nominatim bbox: [south, north, west, east]
    const [south, north, west, east] = result.bbox
    requestFitBounds([
      [west, south],
      [east, north],
    ])
    message.success(`已跳转至 ${result.name}`)
    handleClose()
  }

  const cityPanel = (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 12, color: '#8f959e', marginBottom: 8 }}>
        输入城市名或地名（支持中英文），点击搜索结果跳转
      </div>
      <ControlGroup fill>
        <InputGroup
          placeholder="如 上海、Tokyo、New York"
          value={cityQuery}
          onChange={(e) => setCityQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCitySearch()
          }}
          disabled={cityLoading}
        />
        <Button
          intent={Intent.PRIMARY}
          icon="search"
          loading={cityLoading}
          text="搜索"
          onClick={handleCitySearch}
        />
      </ControlGroup>

      {citySearched && (
        <div style={{ marginTop: 10 }}>
          {cityResults.length === 0 && !cityLoading ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#8f959e', fontSize: 12 }}>
              无匹配结果
            </div>
          ) : (
            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                border: '1px solid #d9dce0',
                borderRadius: 3,
              }}
            >
              {cityResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleCitySelect(item)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderBottom: idx < cityResults.length - 1 ? '1px solid #f0f0f0' : 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f0f7ff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Icon icon="map-marker" intent={Intent.PRIMARY} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2329', marginBottom: 1 }}>
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#8f959e',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.displayName}
                    </div>
                  </div>
                  <Tag minimal style={{ fontSize: 10, flexShrink: 0, marginTop: 2 }}>
                    {item.type}
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  const coordsPanel = (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 12, color: '#8f959e', marginBottom: 10 }}>
        输入十进制度数（如纬度 31.2304，经度 121.4737）
      </div>
      <FormGroup label="纬度 (Latitude)">
        <InputGroup
          placeholder="-90 ~ 90"
          value={latValue}
          onChange={(e) => setLatValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCoordJump()
          }}
        />
      </FormGroup>
      <FormGroup label="经度 (Longitude)">
        <InputGroup
          placeholder="-180 ~ 180"
          value={lonValue}
          onChange={(e) => setLonValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCoordJump()
          }}
        />
      </FormGroup>
      <Button
        intent={Intent.PRIMARY}
        fill
        icon="search"
        text="跳转"
        onClick={handleCoordJump}
      />
    </div>
  )

  const iataPanel = (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 12, color: '#8f959e', marginBottom: 10 }}>
        输入 3 位 IATA 代码（如 PEK、SHA、CAN）跳转至该机场范围
      </div>
      <ControlGroup fill>
        <InputGroup
          placeholder="如 PEK、SHA、CAN"
          maxLength={3}
          value={iataValue}
          onChange={(e) => setIataValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleIataSearch()
          }}
          style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }}
        />
        <Button
          intent={Intent.PRIMARY}
          icon="search"
          text="跳转"
          onClick={handleIataSearch}
        />
      </ControlGroup>
    </div>
  )

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="位置搜索"
      icon="search"
      style={{ width: 440 }}
    >
      <DialogBody>
        <Tabs
          id="location-search-tabs"
          selectedTabId={activeTab}
          onChange={(id) => setActiveTab(String(id))}
        >
          <Tab id="city" title="城市/地名" panel={cityPanel} />
          <Tab id="coords" title="经纬度" panel={coordsPanel} />
          <Tab id="iata" title="机场三字码" panel={iataPanel} />
        </Tabs>
      </DialogBody>
    </Dialog>
  )
}
