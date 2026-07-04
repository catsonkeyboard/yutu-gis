import { InputNumber, Button, Space } from 'antd'
import { BorderOutlined, AimOutlined } from '@ant-design/icons'
import type { MapBbox } from '../../hooks/useMapBboxSelect'

interface Props {
  bbox: MapBbox | null
  onChange: (bbox: MapBbox) => void
  selecting: boolean
  onToggleSelecting: () => void
  onUseViewport: () => void
  disabled?: boolean
}

/** Bbox input grid + drag-select / use-viewport buttons, shared by tool panels. */
export default function BboxSelector({
  bbox, onChange, selecting, onToggleSelecting, onUseViewport, disabled
}: Props) {
  const update = (index: number, value: number | null) => {
    if (!bbox || value === null) return
    const next = [...bbox] as MapBbox
    next[index] = value
    onChange(next)
  }

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Space size={4}>
        <InputNumber size="small" addonBefore="南" value={bbox?.[0]} step={0.01}
          onChange={(v) => update(0, v)} style={{ width: 140 }} disabled={disabled} />
        <InputNumber size="small" addonBefore="北" value={bbox?.[2]} step={0.01}
          onChange={(v) => update(2, v)} style={{ width: 140 }} disabled={disabled} />
      </Space>
      <Space size={4}>
        <InputNumber size="small" addonBefore="西" value={bbox?.[1]} step={0.01}
          onChange={(v) => update(1, v)} style={{ width: 140 }} disabled={disabled} />
        <InputNumber size="small" addonBefore="东" value={bbox?.[3]} step={0.01}
          onChange={(v) => update(3, v)} style={{ width: 140 }} disabled={disabled} />
      </Space>
      <Space size={4}>
        <Button
          size="small"
          icon={<BorderOutlined />}
          type={selecting ? 'primary' : 'default'}
          onClick={onToggleSelecting}
          disabled={disabled}
        >
          {selecting ? '在地图上拖动框选…' : '框选范围'}
        </Button>
        <Button size="small" icon={<AimOutlined />} onClick={onUseViewport} disabled={disabled}>
          当前视图
        </Button>
      </Space>
    </Space>
  )
}
