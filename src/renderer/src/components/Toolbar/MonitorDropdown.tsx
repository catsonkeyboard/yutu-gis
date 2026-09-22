import { useState } from 'react'
import {
  Button,
  Checkbox,
  Classes,
  Divider,
  Intent,
  Popover,
  Tooltip,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import {
  useMonitorStore,
  isMonitorActive,
  type WeatherOverlayKey,
  type GibsOverlayKey,
} from '../../stores/monitorStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { message } from '../../utils/toaster'

const OWM_KEYS: WeatherOverlayKey[] = ['precipitation', 'temp', 'clouds', 'wind', 'pressure']
const GIBS_KEYS: GibsOverlayKey[] = ['truecolor', 'sst', 'nightlights']

interface Props {
  onSettings?: () => void
}

export default function MonitorDropdown({ onSettings }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const weather = useMonitorStore((s) => s.weather)
  const gibs = useMonitorStore((s) => s.gibs)
  const earthquakeOn = useMonitorStore((s) => s.earthquakeOn)
  const typhoonOn = useMonitorStore((s) => s.typhoonOn)
  const fireOn = useMonitorStore((s) => s.fireOn)
  const gdacsOn = useMonitorStore((s) => s.gdacsOn)
  const aqiOn = useMonitorStore((s) => s.aqiOn)
  const error = useMonitorStore((s) => s.error)
  const {
    toggleWeather,
    toggleGibs,
    setEarthquakeOn,
    setTyphoonOn,
    setFireOn,
    setGdacsOn,
    setAqiOn,
  } = useMonitorStore.getState()
  const apiKeys = useSettingsStore((s) => s.apiKeys)

  const active = isMonitorActive({ weather, gibs, earthquakeOn, typhoonOn, fireOn, gdacsOn, aqiOn })

  /** Block enabling a key-gated overlay when the key is missing: warn + open settings. */
  const requireKey = (key: string, msgKey: string, enable: () => void, turningOn: boolean) => {
    if (turningOn && !key) {
      message.warning(t(msgKey))
      setOpen(false)
      onSettings?.()
      return
    }
    enable()
  }

  const handleOwmToggle = (key: WeatherOverlayKey) =>
    requireKey(apiKeys.openweather, 'monitor.needKey', () => toggleWeather(key), !weather[key])

  const sectionTitle = (text: string) => (
    <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, fontWeight: 600, margin: '6px 0 4px' }}>
      {text}
    </div>
  )

  const settingsLink = (
    <Button
      variant="minimal"
      size="small"
      icon="cog"
      intent={Intent.PRIMARY}
      style={{ fontSize: 11, padding: '0 4px', minHeight: 18, height: 18 }}
      onClick={() => {
        setOpen(false)
        onSettings?.()
      }}
      text={t('monitor.goSettings')}
    />
  )

  const panel = (
    <div style={{ width: 260, maxHeight: '70vh', overflowY: 'auto', padding: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t('monitor.title')}</div>

      {sectionTitle(t('monitor.weather'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Checkbox
          checked={weather.radar}
          onChange={() => toggleWeather('radar')}
          label={t('monitor.radar')}
          style={{ marginBottom: 4 }}
        />
        {OWM_KEYS.map((key) => (
          <Checkbox
            key={key}
            checked={weather[key]}
            onChange={() => handleOwmToggle(key)}
            label={t(`monitor.${key}`)}
            style={{ marginBottom: 4 }}
          />
        ))}
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, paddingLeft: 22, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{t('monitor.owmHint')}</span>
          {settingsLink}
        </div>
      </div>

      <Divider style={{ margin: '8px 0' }} />
      {sectionTitle(t('monitor.satellite'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {GIBS_KEYS.map((key) => (
          <Checkbox
            key={key}
            checked={gibs[key]}
            onChange={() => toggleGibs(key)}
            label={t(`monitor.gibs.${key}`)}
            style={{ marginBottom: 4 }}
          />
        ))}
      </div>

      <Divider style={{ margin: '8px 0' }} />
      {sectionTitle(t('monitor.hazards'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Checkbox
          checked={earthquakeOn}
          onChange={(e) => setEarthquakeOn((e.target as HTMLInputElement).checked)}
          label={t('monitor.quakeLayer')}
          style={{ marginBottom: 4 }}
        />
        <Checkbox
          checked={typhoonOn}
          onChange={(e) => setTyphoonOn((e.target as HTMLInputElement).checked)}
          label={t('monitor.typhoonLayer')}
          style={{ marginBottom: 4 }}
        />
        <Checkbox
          checked={fireOn}
          onChange={(e) =>
            requireKey(
              apiKeys.firms,
              'monitor.needFirmsKey',
              () => setFireOn((e.target as HTMLInputElement).checked),
              (e.target as HTMLInputElement).checked
            )
          }
          label={t('monitor.fireLayer')}
          style={{ marginBottom: 4 }}
        />
        <Checkbox
          checked={gdacsOn}
          onChange={(e) => setGdacsOn((e.target as HTMLInputElement).checked)}
          label={t('monitor.gdacsLayer')}
          style={{ marginBottom: 4 }}
        />
      </div>

      <Divider style={{ margin: '8px 0' }} />
      {sectionTitle(t('monitor.airQuality'))}
      <Checkbox
        checked={aqiOn}
        onChange={(e) =>
          requireKey(
            apiKeys.waqi,
            'monitor.needWaqiKey',
            () => setAqiOn((e.target as HTMLInputElement).checked),
            (e.target as HTMLInputElement).checked
          )
        }
        label={t('monitor.aqiLayer')}
        style={{ marginBottom: 4 }}
      />

      {error && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ color: '#c5382c', fontSize: 11 }}>{error}</div>
        </>
      )}
    </div>
  )

  return (
    <Popover
      content={panel}
      isOpen={open}
      onInteraction={(nextOpen) => setOpen(nextOpen)}
      placement="bottom-start"
    >
      <Tooltip content={t('monitor.title')} placement="bottom">
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <Button
            icon="pulse"
            variant="minimal"
            size="small"
            intent={active ? Intent.PRIMARY : undefined}
            active={active || open}
          />
          {active && (
            <span
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#15b374',
                pointerEvents: 'none',
              }}
            />
          )}
        </span>
      </Tooltip>
    </Popover>
  )
}
