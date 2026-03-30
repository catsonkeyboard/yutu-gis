import { useState } from 'react'
import { Modal, Tabs, Input, Button, message, Typography, Space } from 'antd'
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
        if (!visible) setIataValue('')
      }}
    >
      <Tabs
        items={[
          {
            key: 'iata',
            label: '机场三字码',
            children: iataTab,
          },
        ]}
      />
    </Modal>
  )
}
