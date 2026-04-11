import { useState } from 'react'
import { Modal, Tabs, Input, Button, message, Typography, Space, Form } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { searchAirportByIata } from '../../services/api'
import { useMapStore } from '../../stores/mapStore'

const { Text } = Typography

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

  return (
    <Modal
      title="位置搜索"
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      destroyOnClose
      afterOpenChange={(visible) => {
        if (!visible) {
          setIataValue('')
          setLatValue('')
          setLonValue('')
        }
      }}
    >
      <Tabs
        items={[
          { key: 'coords', label: '经纬度', children: coordTab },
          { key: 'iata', label: '机场三字码', children: iataTab },
        ]}
      />
    </Modal>
  )
}
