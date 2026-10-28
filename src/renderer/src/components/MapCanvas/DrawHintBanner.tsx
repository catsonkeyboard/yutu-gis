import type { ReactElement } from 'react'
import { Button, Icon } from '@blueprintjs/core'
import { useDrawStore, type DrawMode } from '../../stores/drawStore'

const HINTS: Record<Exclude<DrawMode, 'off'>, string> = {
  point: '在地图上单击添加点要素',
  line: '依次单击添加折线顶点，双击结束',
  polygon: '依次单击添加面顶点，双击闭合',
}

export default function DrawHintBanner({ onSave }: { onSave: () => void }): ReactElement | null {
  const drawMode = useDrawStore((s) => s.drawMode)
  const features = useDrawStore((s) => s.features)

  if (drawMode === 'off') return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-map-overlay)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--color-bg-elevated)',
        color: 'var(--color-text)',
        padding: '6px 8px 6px 12px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border-strong)',
        boxShadow: 'var(--shadow-md)',
        fontSize: 12,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon icon="edit" size={12} color="var(--color-primary)" />
      <span style={{ pointerEvents: 'none' }}>{HINTS[drawMode]}</span>
      {features.length > 0 && (
        <Button size="small" intent="primary" icon="floppy-disk" onClick={onSave} text="完成并保存" />
      )}
    </div>
  )
}
