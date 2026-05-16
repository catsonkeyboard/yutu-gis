import { useState } from 'react'
import { Modal, Tabs, Input, Button, message, Typography, Space, Form, List } from 'antd'
import { SearchOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { searchAirportByIata } from '../../services/api'
import { useMapStore } from '../../stores/mapStore'

const { Text } = Typography

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

export default function LocationSearchModal({ open, onClose }: Props) {
  const requestFitBounds = useMapStore((s) => s.requestFitBounds)

  const [iataValue, setIataValue] = useState('')
  const [iataLoading, setIataLoading] = useState(false)

  const [latValue, setLatValue] = useState('')
  const [lonValue, setLonValue] = useState('')

  const [cityQuery, setCityQuery] = useState('')
  const [cityLoading, setCityLoading] = useState(false)
  const [cityResults, setCityResults] = useState<GeocodingResult[]>([])
  const [citySearched, setCitySearched] = useState(false)

  const handleIataSearch = async () => {
    const code = iataValue.trim().toUpperCase()
    if (code.length !== 3) {
      message.warning('请输入 3 位 IATA 机场代码')
      return
    }
    setIataLoading(true)
    try {
      const airport = await searchAirportByIata(code)
      const [west, south, east, north] = airport.bbox
      requestFitBounds([[west, south], [east, north]])
      message.success(`已跳转至 ${airport.name}（${airport.iata}）`)
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`未找到机场 ${code}：${msg}`)
    } finally {
      setIataLoading(false)
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
    const delta = 0.01
    requestFitBounds([[lon - delta, lat - delta], [lon + delta, lat + delta]])
    message.success(`已跳转至 ${lat}, ${lon}`)
    onClose()
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
    requestFitBounds([[west, south], [east, north]])
    message.success(`已跳转至 ${result.name}`)
    onClose()
  }

  const coordTab = (
    <Space direction="vertical" style={{ width: '100%', paddingTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        输入十进制度数（如纬度 31.2304，经度 121.4737）
      </Text>
      <Form layout="vertical" style={{ marginBottom: 0 }}>
        <Form.Item label="纬度" style={{ marginBottom: 8 }}>
          <Input
            placeholder="-90 ~ 90"
            value={latValue}
            onChange={(e) => setLatValue(e.target.value)}
            onPressEnter={handleCoordJump}
            autoFocus
          />
        </Form.Item>
        <Form.Item label="经度" style={{ marginBottom: 8 }}>
          <Input
            placeholder="-180 ~ 180"
            value={lonValue}
            onChange={(e) => setLonValue(e.target.value)}
            onPressEnter={handleCoordJump}
          />
        </Form.Item>
      </Form>
      <Button
        type="primary"
        icon={<SearchOutlined />}
        onClick={handleCoordJump}
        style={{ width: '100%' }}
      >
        跳转
      </Button>
    </Space>
  )

  const iataTab = (
    <Space direction="vertical" style={{ width: '100%', paddingTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        输入 3 位 IATA 代码（如 PEK、SHA、CAN）跳转至该机场范围
      </Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="如 PEK、SHA、CAN"
          maxLength={3}
          value={iataValue}
          onChange={(e) => setIataValue(e.target.value.toUpperCase())}
          onPressEnter={handleIataSearch}
          disabled={iataLoading}
          style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }}
          autoFocus
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          loading={iataLoading}
          onClick={handleIataSearch}
        >
          跳转
        </Button>
      </Space.Compact>
    </Space>
  )

  const cityTab = (
    <Space direction="vertical" style={{ width: '100%', paddingTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        输入城市名或地名（支持中英文），点击搜索结果跳转
      </Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="如 上海、Tokyo、New York"
          value={cityQuery}
          onChange={(e) => setCityQuery(e.target.value)}
          onPressEnter={handleCitySearch}
          disabled={cityLoading}
          autoFocus
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          loading={cityLoading}
          onClick={handleCitySearch}
        >
          搜索
        </Button>
      </Space.Compact>

      {citySearched && (
        <div style={{ marginTop: 4 }}>
          {cityResults.length === 0 && !cityLoading ? (
            <div
              style={{
                padding: '16px 0',
                textAlign: 'center',
                color: '#8f959e',
                fontSize: 12,
              }}
            >
              无匹配结果
            </div>
          ) : (
            <List
              size="small"
              dataSource={cityResults}
              style={{ maxHeight: 260, overflowY: 'auto' }}
              renderItem={(item) => (
                <List.Item
                  onClick={() => handleCitySelect(item)}
                  style={{
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: 2,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = '#f0f7ff'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.background = ''
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
                    <EnvironmentOutlined
                      style={{ color: '#1a6fb5', marginTop: 2, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#1f2329',
                          marginBottom: 1,
                        }}
                      >
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
                    <div
                      style={{
                        fontSize: 10,
                        color: '#646a73',
                        background: '#f5f6f8',
                        border: '1px solid #e5e7eb',
                        borderRadius: 2,
                        padding: '1px 6px',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {item.type}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      )}
    </Space>
  )

  return (
    <Modal
      title="位置搜索"
      open={open}
      onCancel={onClose}
      footer={null}
      width={440}
      destroyOnClose
      afterOpenChange={(visible) => {
        if (!visible) {
          setIataValue('')
          setLatValue('')
          setLonValue('')
          setCityQuery('')
          setCityResults([])
          setCitySearched(false)
        }
      }}
    >
      <Tabs
        items={[
          { key: 'city', label: '城市/地名', children: cityTab },
          { key: 'coords', label: '经纬度', children: coordTab },
          { key: 'iata', label: '机场三字码', children: iataTab },
        ]}
      />
    </Modal>
  )
}
