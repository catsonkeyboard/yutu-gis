import type { ReactElement } from 'react'
import { Button, Dropdown, Tooltip, message } from 'antd'
import { CameraOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { getMap } from '../../services/mapRef'
import { composeMapPng } from '../../utils/mapExport'
import { getAttribution } from '../MapCanvas/tileProviders'
import { useMapStore } from '../../stores/mapStore'

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

  return (
    <Dropdown
      menu={{
        items: [
          { key: 'png', icon: <DownloadOutlined />, label: t('mapExport.exportPng') },
          { key: 'copy', icon: <CopyOutlined />, label: t('mapExport.copy') },
        ],
        onClick: ({ key }) => {
          if (key === 'png') handleExportPng()
          else handleCopy()
        },
      }}
      trigger={['click']}
    >
      <Tooltip title={t('mapExport.title')}>
        <Button icon={<CameraOutlined />} type="text" size="small" />
      </Tooltip>
    </Dropdown>
  )
}
