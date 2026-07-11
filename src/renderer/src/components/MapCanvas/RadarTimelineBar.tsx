import type { ReactElement } from 'react'
import { Button, Slider, Tag, Typography } from 'antd'
import { PauseOutlined, CaretRightOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useMonitorStore } from '../../stores/monitorStore'

const { Text } = Typography

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
        borderRadius: 6,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        zIndex: 620,
        padding: '4px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Button
        size="small"
        type="text"
        icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
        onClick={() => setRadarPlaying(!playing)}
        disabled={frames.length < 2}
      />
      <Slider
        style={{ flex: 1, margin: '4px 0' }}
        min={0}
        max={frames.length - 1}
        value={Math.min(index, frames.length - 1)}
        onChange={(v) => {
          setRadarPlaying(false)
          setRadarIndex(v)
        }}
        tooltip={{ open: false }}
      />
      <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {timeLabel}
      </Text>
      {frame?.nowcast && (
        <Tag color="orange" style={{ fontSize: 10, marginInlineEnd: 0, lineHeight: '16px' }}>
          {t('monitor.forecast')}
        </Tag>
      )}
    </div>
  )
}
