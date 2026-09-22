import { useTranslation } from 'react-i18next'
import { Classes, Tag } from '@blueprintjs/core'
import { useMapStore } from '../../stores/mapStore'

export default function StatusBar() {
  const { t } = useTranslation()
  const { center, zoom } = useMapStore()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <span className={Classes.TEXT_MUTED}>
        {t('status.lng')}: <strong style={{ color: 'inherit' }}>{center[0].toFixed(4)}°</strong>
      </span>
      <span className={Classes.TEXT_MUTED}>·</span>
      <span className={Classes.TEXT_MUTED}>
        {t('status.lat')}: <strong style={{ color: 'inherit' }}>{center[1].toFixed(4)}°</strong>
      </span>
      <span className={Classes.TEXT_MUTED}>·</span>
      <span className={Classes.TEXT_MUTED}>
        {t('status.zoom')}: <strong style={{ color: 'inherit' }}>{zoom.toFixed(1)}</strong>
      </span>
      <Tag minimal round style={{ fontSize: 10, minHeight: 16, height: 16, padding: '0 6px' }}>
        {t('status.crs')}: WGS84
      </Tag>
    </div>
  )
}
