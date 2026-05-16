import { useTranslation } from 'react-i18next'
import { useMapStore } from '../../stores/mapStore'

export default function StatusBar() {
  const { t } = useTranslation()
  const { center, zoom } = useMapStore()

  return (
    <span style={{ fontSize: 11, color: '#646a73', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.2px' }}>
      {t('status.lng')}: {center[0].toFixed(4)}&nbsp;&nbsp;
      {t('status.lat')}: {center[1].toFixed(4)}&nbsp;&nbsp;
      {t('status.zoom')}: {zoom.toFixed(1)}&nbsp;&nbsp;
      {t('status.crs')}: WGS84
    </span>
  )
}
