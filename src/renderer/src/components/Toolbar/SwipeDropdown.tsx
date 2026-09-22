import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Classes,
  HTMLSelect,
  Intent,
  Popover,
  Switch,
  Tooltip,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useSwipeStore } from '../../stores/swipeStore'
import { useLayerStore } from '../../stores/layerStore'
import { useDrawStore } from '../../stores/drawStore'
import { useMeasureStore } from '../../stores/measureStore'

export default function SwipeDropdown(): ReactElement {
  const { t } = useTranslation()
  const { enabled, layerId, setEnabled, setLayer } = useSwipeStore()
  const layers = useLayerStore((s) => s.layers)
  const drawMode = useDrawStore((s) => s.drawMode)
  const measureMode = useMeasureStore((s) => s.mode)
  const [open, setOpen] = useState(false)

  const blocked = drawMode !== 'off' || measureMode !== 'off'
  const options = [
    { value: '', label: t('swipe.selectLayer') },
    ...layers.map((l) => ({ value: l.id, label: l.name })),
  ]

  const content = (
    <div style={{ width: 240, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{t('swipe.title')}</div>
      <div className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
        {t('swipe.hint')}
      </div>
      <HTMLSelect
        fill
        value={layerId ?? ''}
        onChange={(e) => setLayer(e.target.value || null)}
        options={options}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <Switch
          checked={enabled}
          disabled={!layerId}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
          style={{ marginBottom: 0 }}
        />
        <span style={{ fontSize: 12 }}>{enabled ? t('swipe.on') : t('swipe.off')}</span>
      </div>
    </div>
  )

  return (
    <Popover
      content={content}
      isOpen={open}
      onInteraction={(nextOpen) => setOpen(nextOpen)}
      placement="bottom-start"
    >
      <Tooltip content={blocked ? t('swipe.blocked') : t('swipe.title')} placement="bottom">
        <Button
          icon="split-columns"
          variant="minimal"
          size="small"
          intent={enabled ? Intent.PRIMARY : undefined}
          active={enabled}
          disabled={blocked}
        />
      </Tooltip>
    </Popover>
  )
}
