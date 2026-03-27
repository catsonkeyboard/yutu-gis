import { Select } from 'antd'
import { useTranslation } from 'react-i18next'
import { useMapStore } from '../../stores/mapStore'
import type { MapProvider } from './tileProviders'

const PROVIDERS: MapProvider[] = [
  'osm',
  'google-street',
  'google-satellite',
  'amap-street',
  'amap-satellite',
  'amap-terrain',
]

export default function BasemapSwitcher() {
  const { t } = useTranslation()
  const { provider, setProvider } = useMapStore()

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        right: 10,
        zIndex: 10,
      }}
    >
      <Select
        value={provider}
        onChange={(v) => setProvider(v as MapProvider)}
        style={{ width: 150 }}
        size="small"
        options={PROVIDERS.map((p) => ({
          value: p,
          label: t(`map.providers.${p}`),
        }))}
      />
    </div>
  )
}
