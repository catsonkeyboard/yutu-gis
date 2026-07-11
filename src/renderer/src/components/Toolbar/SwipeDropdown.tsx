import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button, Popover, Select, Space, Switch, Tooltip, Typography } from 'antd'
import { PicCenterOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useSwipeStore } from '../../stores/swipeStore'
import { useLayerStore } from '../../stores/layerStore'
import { useDrawStore } from '../../stores/drawStore'
import { useMeasureStore } from '../../stores/measureStore'

const { Text } = Typography

export default function SwipeDropdown(): ReactElement {
  const { t } = useTranslation()
  const { enabled, layerId, setEnabled, setLayer } = useSwipeStore()
  const layers = useLayerStore((s) => s.layers)
  const drawMode = useDrawStore((s) => s.drawMode)
  const measureMode = useMeasureStore((s) => s.mode)
  const [open, setOpen] = useState(false)

  const blocked = drawMode !== 'off' || measureMode !== 'off'
  const options = layers.map((l) => ({ value: l.id, label: l.name }))

  const content = (
    <Space direction="vertical" style={{ width: 240 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t('swipe.hint')}
      </Text>
      <Select
        size="small"
        style={{ width: '100%' }}
        value={layerId ?? undefined}
        onChange={(v) => setLayer(v)}
        options={options}
        placeholder={t('swipe.selectLayer')}
        showSearch
        optionFilterProp="label"
      />
      <Space>
        <Switch
          size="small"
          checked={enabled}
          disabled={!layerId}
          onChange={(v) => setEnabled(v)}
        />
        <Text style={{ fontSize: 12 }}>{enabled ? t('swipe.on') : t('swipe.off')}</Text>
      </Space>
    </Space>
  )

  return (
    <Popover
      content={content}
      title={t('swipe.title')}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
    >
      <Tooltip title={blocked ? t('swipe.blocked') : t('swipe.title')}>
        <Button
          icon={<PicCenterOutlined />}
          type={enabled ? 'primary' : 'text'}
          size="small"
          disabled={blocked}
        />
      </Tooltip>
    </Popover>
  )
}
