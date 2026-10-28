import { useTranslation } from 'react-i18next'
import { Tag } from '@blueprintjs/core'
import { useMapStore } from '../../stores/mapStore'

export default function StatusBar() {
  const { t } = useTranslation()
  const { center, zoom } = useMapStore()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        {t('status.lng')}{' '}
        <strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {center[0].toFixed(4)}°
        </strong>
      </span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        {t('status.lat')}{' '}
        <strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {center[1].toFixed(4)}°
        </strong>
      </span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>
        {t('status.zoom')}{' '}
        <strong style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {zoom.toFixed(1)}
        </strong>
      </span>
      <Tag
        minimal
        round
        style={{
          fontSize: 10,
          minHeight: 16,
          height: 16,
          padding: '0 6px',
          background: 'var(--color-bg-selected)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {t('status.crs')}: WGS84
      </Tag>
    </div>
  )
}
