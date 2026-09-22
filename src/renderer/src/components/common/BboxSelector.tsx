import { Button, ControlGroup, Intent, NumericInput } from '@blueprintjs/core'
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
  bbox,
  onChange,
  selecting,
  onToggleSelecting,
  onUseViewport,
  disabled,
}: Props) {
  const update = (index: number, value: number) => {
    if (!bbox || isNaN(value)) return
    const next = [...bbox] as MapBbox
    next[index] = value
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <ControlGroup fill>
          <span style={{ fontSize: 11, padding: '4px 6px', background: 'var(--color-bg-panel, #f5f6f8)', border: '1px solid #d9dce0', borderRight: 'none', borderRadius: '3px 0 0 3px', color: '#646a73' }}>
            南
          </span>
          <NumericInput
            size="small"
            value={bbox?.[0] ?? ''}
            stepSize={0.01}
            minorStepSize={0.001}
            onValueChange={(v) => update(0, v)}
            disabled={disabled}
          />
        </ControlGroup>
        <ControlGroup fill>
          <span style={{ fontSize: 11, padding: '4px 6px', background: 'var(--color-bg-panel, #f5f6f8)', border: '1px solid #d9dce0', borderRight: 'none', borderRadius: '3px 0 0 3px', color: '#646a73' }}>
            北
          </span>
          <NumericInput
            size="small"
            value={bbox?.[2] ?? ''}
            stepSize={0.01}
            minorStepSize={0.001}
            onValueChange={(v) => update(2, v)}
            disabled={disabled}
          />
        </ControlGroup>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <ControlGroup fill>
          <span style={{ fontSize: 11, padding: '4px 6px', background: 'var(--color-bg-panel, #f5f6f8)', border: '1px solid #d9dce0', borderRight: 'none', borderRadius: '3px 0 0 3px', color: '#646a73' }}>
            西
          </span>
          <NumericInput
            size="small"
            value={bbox?.[1] ?? ''}
            stepSize={0.01}
            minorStepSize={0.001}
            onValueChange={(v) => update(1, v)}
            disabled={disabled}
          />
        </ControlGroup>
        <ControlGroup fill>
          <span style={{ fontSize: 11, padding: '4px 6px', background: 'var(--color-bg-panel, #f5f6f8)', border: '1px solid #d9dce0', borderRight: 'none', borderRadius: '3px 0 0 3px', color: '#646a73' }}>
            东
          </span>
          <NumericInput
            size="small"
            value={bbox?.[3] ?? ''}
            stepSize={0.01}
            minorStepSize={0.001}
            onValueChange={(v) => update(3, v)}
            disabled={disabled}
          />
        </ControlGroup>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <Button
          size="small"
          icon="polygon-filter"
          intent={selecting ? Intent.PRIMARY : undefined}
          active={selecting}
          onClick={onToggleSelecting}
          disabled={disabled}
          text={selecting ? '在地图上拖动框选…' : '框选范围'}
        />
        <Button
          size="small"
          icon="locate"
          onClick={onUseViewport}
          disabled={disabled}
          text="当前视图"
        />
      </div>
    </div>
  )
}
