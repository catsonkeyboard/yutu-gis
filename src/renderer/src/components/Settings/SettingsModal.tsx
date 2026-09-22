import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  ControlGroup,
  Dialog,
  DialogBody,
  DialogFooter,
  Divider,
  FormGroup,
  HTMLSelect,
  InputGroup,
  Intent,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import i18n from '../../i18n'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: Props): ReactElement {
  const { t } = useTranslation()
  const { language, apiKeys, downloadDir, setLanguage, setApiKeys, setDownloadDir } =
    useSettingsStore()

  const [lang, setLang] = useState(language)
  const [dlDir, setDlDir] = useState(downloadDir)
  const [googleKey, setGoogleKey] = useState(apiKeys.google)
  const [amapKey, setAmapKey] = useState(apiKeys.amap)
  const [openWeatherKey, setOpenWeatherKey] = useState(apiKeys.openweather)
  const [firmsKey, setFirmsKey] = useState(apiKeys.firms)
  const [waqiKey, setWaqiKey] = useState(apiKeys.waqi)
  const [showKeys, setShowKeys] = useState(false)

  // Sync state whenever modal opens
  useEffect(() => {
    if (open) {
      setLang(language)
      setDlDir(downloadDir)
      setGoogleKey(apiKeys.google)
      setAmapKey(apiKeys.amap)
      setOpenWeatherKey(apiKeys.openweather)
      setFirmsKey(apiKeys.firms)
      setWaqiKey(apiKeys.waqi)
    }
  }, [open, language, downloadDir, apiKeys])

  const handlePickDownloadDir = async () => {
    const dir = await window.electronAPI.openDirectoryDialog(dlDir)
    if (dir) setDlDir(dir)
  }

  const handleSave = async () => {
    setLanguage(lang)
    setApiKeys({
      google: googleKey,
      amap: amapKey,
      openweather: openWeatherKey,
      firms: firmsKey,
      waqi: waqiKey,
    })
    setDownloadDir(dlDir)
    await i18n.changeLanguage(lang)
    // Partial update — keys not managed here (e.g. bookmarks) survive
    await window.electronAPI.updateConfig({
      language: lang,
      googleMap: { apiKey: googleKey },
      amap: { apiKey: amapKey },
      openWeather: { apiKey: openWeatherKey },
      firms: { apiKey: firmsKey },
      waqi: { apiKey: waqiKey },
      download: { dir: dlDir },
    })
    onClose()
  }

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title={t('settings.title')}
      icon="cog"
      style={{ width: 480 }}
    >
      <DialogBody>
        <FormGroup label={t('settings.language')}>
          <HTMLSelect
            value={lang}
            onChange={(e) => setLang(e.target.value as 'zh' | 'en')}
            options={[
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
            style={{ width: 180 }}
          />
        </FormGroup>

        <FormGroup
          label={t('settings.downloadDir')}
          helperText={t('settings.downloadDirHint')}
        >
          <ControlGroup fill>
            <InputGroup
              readOnly
              value={dlDir}
              placeholder="~/Downloads"
            />
            <Button
              icon="folder-open"
              text={t('settings.browse')}
              onClick={handlePickDownloadDir}
            />
          </ControlGroup>
        </FormGroup>

        <Divider style={{ margin: '16px 0 12px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary, #8f959e)' }}>
            {t('settings.apiKeys')}
          </span>
          <Button
            small
            minimal
            icon={showKeys ? 'eye-off' : 'eye-open'}
            text={showKeys ? '隐藏密钥' : '显示密钥'}
            onClick={() => setShowKeys(!showKeys)}
          />
        </div>

        <FormGroup
          label={t('settings.googleKey')}
          helperText="用于 Google Maps 街道图和影像图"
        >
          <InputGroup
            type={showKeys ? 'text' : 'password'}
            placeholder="AIzaSy..."
            value={googleKey}
            onChange={(e) => setGoogleKey(e.target.value)}
            autoComplete="off"
          />
        </FormGroup>

        <FormGroup
          label={t('settings.amapKey')}
          helperText="用于高德地图（当前使用公共服务，无需 Key）"
        >
          <InputGroup
            type={showKeys ? 'text' : 'password'}
            placeholder="your-amap-key"
            value={amapKey}
            onChange={(e) => setAmapKey(e.target.value)}
            autoComplete="off"
          />
        </FormGroup>

        <FormGroup
          label={t('settings.openWeatherKey')}
          helperText={t('settings.openWeatherKeyHint')}
        >
          <InputGroup
            type={showKeys ? 'text' : 'password'}
            placeholder="OpenWeatherMap API Key"
            value={openWeatherKey}
            onChange={(e) => setOpenWeatherKey(e.target.value)}
            autoComplete="off"
          />
        </FormGroup>

        <FormGroup
          label={t('settings.firmsKey')}
          helperText={t('settings.firmsKeyHint')}
        >
          <InputGroup
            type={showKeys ? 'text' : 'password'}
            placeholder="NASA FIRMS MAP_KEY"
            value={firmsKey}
            onChange={(e) => setFirmsKey(e.target.value)}
            autoComplete="off"
          />
        </FormGroup>

        <FormGroup
          label={t('settings.waqiKey')}
          helperText={t('settings.waqiKeyHint')}
        >
          <InputGroup
            type={showKeys ? 'text' : 'password'}
            placeholder="WAQI token"
            value={waqiKey}
            onChange={(e) => setWaqiKey(e.target.value)}
            autoComplete="off"
          />
        </FormGroup>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={onClose} text={t('common.cancel')} />
            <Button
              intent={Intent.PRIMARY}
              onClick={handleSave}
              text={t('settings.save')}
            />
          </>
        }
      />
    </Dialog>
  )
}
