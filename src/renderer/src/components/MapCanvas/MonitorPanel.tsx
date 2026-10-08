import { Button, Checkbox, Classes, Divider, Icon, Intent } from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import {
  useMonitorStore,
  isMonitorActive,
  type WeatherOverlayKey,
  type GibsOverlayKey
} from '../../stores/monitorStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSettingsModalStore } from '../../stores/settingsModalStore'
import { message } from '../../utils/toaster'

const OWM_KEYS: WeatherOverlayKey[] = ['precipitation', 'temp', 'clouds', 'wind', 'pressure']
const GIBS_KEYS: GibsOverlayKey[] = ['truecolor', 'sst', 'nightlights']

/**
 * Floating monitor panel (top-right over the map) — same container pattern
 * as TilesDownloadPanel / OsmExtractPanel / AnalysisPanel. The map stays
 * interactive while toggling overlays.
 */
export default function MonitorPanel(): React.JSX.Element | null {
  const { t } = useTranslation()
  const open = useMonitorStore((s) => s.panelOpen)
  const setPanelOpen = useMonitorStore((s) => s.setPanelOpen)
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
    setAqiOn
  } = useMonitorStore.getState()
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const setSettingsOpen = useSettingsModalStore((s) => s.setOpen)

  if (!open) return null

  const openSettings = (): void => {
    setPanelOpen(false)
    setSettingsOpen(true)
  }

  /** Block enabling a key-gated overlay when the key is missing: warn + open settings. */
  const requireKey = (
    key: string,
    msgKey: string,
    enable: () => void,
    turningOn: boolean
  ): void => {
    if (turningOn && !key) {
      message.warning(t(msgKey))
      openSettings()
      return
    }
    enable()
  }

  const handleOwmToggle = (key: WeatherOverlayKey): void =>
    requireKey(apiKeys.openweather, 'monitor.needKey', () => toggleWeather(key), !weather[key])

  const sectionTitle = (text: string): React.JSX.Element => (
    <div
      className={Classes.TEXT_MUTED}
      style={{ fontSize: 11, fontWeight: 600, margin: '6px 0 4px' }}
    >
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
      onClick={openSettings}
      text={t('monitor.goSettings')}
    />
  )

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 320,
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        zIndex: 600,
        padding: '10px 14px 14px',
        border: '1px solid var(--color-border, #d9dce0)',
        fontSize: 12
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Icon icon="pulse" size={14} />
          <span>{t('monitor.title')}</span>
          {isMonitorActive({ weather, gibs, earthquakeOn, typhoonOn, fireOn, gdacsOn, aqiOn }) && (
            <span
              title={t('monitor.weather')}
              style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#15b374' }}
            />
          )}
        </div>
        <Button size="small" variant="minimal" icon="cross" onClick={() => setPanelOpen(false)} />
      </div>

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
        <div
          className={Classes.TEXT_MUTED}
          style={{ fontSize: 11, paddingLeft: 22, display: 'flex', alignItems: 'center', gap: 4 }}
        >
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
}
