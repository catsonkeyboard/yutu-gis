import { HTMLSelect } from '@blueprintjs/core'
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

  const options = PROVIDERS.map((p) => ({
    value: p,
    label: t(`map.providers.${p}`),
  }))

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        right: 10,
        zIndex: 10,
      }}
    >
      <HTMLSelect
        value={provider}
        onChange={(e) => setProvider(e.target.value as MapProvider)}
        options={options}
        style={{
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          borderRadius: 3,
        }}
      />
    </div>
  )
}
