import { useState } from 'react'
import { Badge, Button, Checkbox, Divider, Popover, Tooltip, Typography, message } from 'antd'
import { FundOutlined, SettingOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  useMonitorStore,
  isMonitorActive,
  type WeatherOverlayKey,
  type GibsOverlayKey,
} from '../../stores/monitorStore'
import { useSettingsStore } from '../../stores/settingsStore'

const { Text } = Typography

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
    toggleWeather, toggleGibs, setEarthquakeOn, setTyphoonOn, setFireOn, setGdacsOn, setAqiOn,
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
    <Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '4px 0' }}>
      {text}
    </Text>
  )

  const settingsLink = (
    <Button
      type="link"
      size="small"
      icon={<SettingOutlined />}
      style={{ fontSize: 11, padding: '0 2px', height: 'auto' }}
      onClick={() => { setOpen(false); onSettings?.() }}
    >
      {t('monitor.goSettings')}
    </Button>
  )

  const panel = (
    <div style={{ width: 260, maxHeight: '70vh', overflowY: 'auto' }}>
      {sectionTitle(t('monitor.weather'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Checkbox checked={weather.radar} onChange={() => toggleWeather('radar')}>
          {t('monitor.radar')}
        </Checkbox>
        {OWM_KEYS.map((key) => (
          <Checkbox key={key} checked={weather[key]} onChange={() => handleOwmToggle(key)}>
            {t(`monitor.${key}`)}
          </Checkbox>
        ))}
        <Text type="secondary" style={{ fontSize: 11, paddingLeft: 24 }}>
          {t('monitor.owmHint')}
          {settingsLink}
        </Text>
      </div>

      <Divider style={{ margin: '8px 0' }} />
      {sectionTitle(t('monitor.satellite'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {GIBS_KEYS.map((key) => (
          <Checkbox key={key} checked={gibs[key]} onChange={() => toggleGibs(key)}>
            {t(`monitor.gibs.${key}`)}
          </Checkbox>
        ))}
      </div>

      <Divider style={{ margin: '8px 0' }} />
      {sectionTitle(t('monitor.hazards'))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Checkbox checked={earthquakeOn} onChange={(e) => setEarthquakeOn(e.target.checked)}>
          {t('monitor.quakeLayer')}
        </Checkbox>
        <Checkbox checked={typhoonOn} onChange={(e) => setTyphoonOn(e.target.checked)}>
          {t('monitor.typhoonLayer')}
        </Checkbox>
        <Checkbox
          checked={fireOn}
          onChange={(e) =>
            requireKey(apiKeys.firms, 'monitor.needFirmsKey', () => setFireOn(e.target.checked), e.target.checked)
          }
        >
          {t('monitor.fireLayer')}
        </Checkbox>
        <Checkbox checked={gdacsOn} onChange={(e) => setGdacsOn(e.target.checked)}>
          {t('monitor.gdacsLayer')}
        </Checkbox>
      </div>

      <Divider style={{ margin: '8px 0' }} />
      {sectionTitle(t('monitor.airQuality'))}
      <Checkbox
        checked={aqiOn}
        onChange={(e) =>
          requireKey(apiKeys.waqi, 'monitor.needWaqiKey', () => setAqiOn(e.target.checked), e.target.checked)
        }
      >
        {t('monitor.aqiLayer')}
      </Checkbox>

      {error && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <Text type="danger" style={{ fontSize: 11 }}>
            {error}
          </Text>
        </>
      )}
    </div>
  )

  return (
    <Popover
      content={panel}
      title={t('monitor.title')}
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
    >
      <Tooltip title={t('monitor.title')}>
        <Badge dot={active} offset={[-2, 2]} status="processing">
          <Button icon={<FundOutlined />} type={active ? 'primary' : 'text'} size="small" />
        </Badge>
      </Tooltip>
    </Popover>
  )
}
