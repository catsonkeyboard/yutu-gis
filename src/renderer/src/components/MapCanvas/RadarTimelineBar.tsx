import type { ReactElement } from 'react'
import { Button, Slider, Tag } from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useMonitorStore } from '../../stores/monitorStore'

/** Floating playback bar for the precipitation radar timeline. */
export default function RadarTimelineBar(): ReactElement | null {
  const { t } = useTranslation()
  const radarOn = useMonitorStore((s) => s.weather.radar)
  const frames = useMonitorStore((s) => s.radarFrames)
  const index = useMonitorStore((s) => s.radarIndex)
  const playing = useMonitorStore((s) => s.radarPlaying)
  const setRadarIndex = useMonitorStore((s) => s.setRadarIndex)
  const setRadarPlaying = useMonitorStore((s) => s.setRadarPlaying)

  if (!radarOn || frames.length === 0) return null

  const frame = frames[Math.min(index, frames.length - 1)]
  const timeLabel = frame?.time
    ? new Date(frame.time * 1000).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '--:--'

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 380,
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        zIndex: 620,
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: '1px solid var(--color-border, #d9dce0)',
        fontSize: 12,
      }}
    >
      <Button
        size="small"
        variant="minimal"
        icon={playing ? 'pause' : 'play'}
        onClick={() => setRadarPlaying(!playing)}
        disabled={frames.length < 2}
      />
      <div style={{ flex: 1, padding: '0 8px' }}>
        <Slider
          min={0}
          max={frames.length - 1}
          stepSize={1}
          value={Math.min(index, frames.length - 1)}
          onChange={(v) => {
            setRadarPlaying(false)
            setRadarIndex(v)
          }}
          labelRenderer={false}
        />
      </div>
      <Tag minimal style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
        {timeLabel}
      </Tag>
      <span style={{ fontSize: 11, color: '#646a73', whiteSpace: 'nowrap' }}>
        {t('monitor.radar')}
      </span>
    </div>
  )
}
