import type { ReactElement } from 'react'
import { Button, Menu, MenuItem, Popover, Tooltip } from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { getMap } from '../../services/mapRef'
import { composeMapPng } from '../../utils/mapExport'
import { getAttribution } from '../MapCanvas/tileProviders'
import { useMapStore } from '../../stores/mapStore'
import { message } from '../../utils/toaster'

export default function MapExportDropdown(): ReactElement {
  const { t } = useTranslation()

  const capture = async (): Promise<Blob | null> => {
    const map = getMap()
    if (!map) {
      message.error(t('mapExport.noMap'))
      return null
    }
    const provider = useMapStore.getState().provider
    return composeMapPng(map, getAttribution(provider))
  }

  const handleExportPng = async () => {
    const filePath = await window.electronAPI.saveFileDialog(
      [{ name: 'PNG', extensions: ['png'] }],
      `map-${new Date().toISOString().slice(0, 10)}.png`
    )
    if (!filePath) return
    try {
      const blob = await capture()
      if (!blob) return
      await window.electronAPI.writeFileBinary(filePath, await blob.arrayBuffer())
      message.success(t('mapExport.saved', { path: filePath.split('/').pop() }))
    } catch (e) {
      message.error(`${t('mapExport.failed')}：${(e as Error).message}`)
    }
  }

  const handleCopy = async () => {
    try {
      const blob = await capture()
      if (!blob) return
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      message.success(t('mapExport.copied'))
    } catch (e) {
      message.error(`${t('mapExport.failed')}：${(e as Error).message}`)
    }
  }

  const menu = (
    <Menu>
      <MenuItem icon="download" text={t('mapExport.exportPng')} onClick={handleExportPng} />
      <MenuItem icon="clipboard" text={t('mapExport.copy')} onClick={handleCopy} />
    </Menu>
  )

  return (
    <Popover content={menu} placement="bottom-start">
      <Tooltip content={t('mapExport.title')} placement="bottom">
        <Button icon="camera" variant="minimal" size="small" />
      </Tooltip>
    </Popover>
  )
}
