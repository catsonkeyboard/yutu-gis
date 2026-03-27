// src/renderer/src/components/OsmExtract/OsmExtractModal.tsx
import { useState, useEffect } from 'react'
import { Modal, Table, Spin, Alert, Button, Tag, Space } from 'antd'
import type { TableProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { osmExtract } from '../../services/api'

interface OsmFeature {
  key: string
  label: string
  geomType: string
  feature: GeoJSON.Feature
}

interface Props {
  open: boolean
  lngLat: [number, number] | null
  onClose: () => void
  onImport: (fc: GeoJSON.FeatureCollection, name: string) => void
}

export default function OsmExtractModal({ open, lngLat, onClose, onImport }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<OsmFeature[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  useEffect(() => {
    if (!open || !lngLat) return
    setLoading(true)
    setError(null)
    setRows([])
    setSelectedKeys([])

    osmExtract(lngLat[1], lngLat[0])
      .then((fc) => {
        const items: OsmFeature[] = fc.features.map((f, i) => ({
          key: `${f.properties?._osm_type}-${f.properties?._osm_id}-${i}`,
          label: f.properties?._feature_label ?? t('osm.colName'),
          geomType: f.geometry.type,
          feature: f,
        }))
        setRows(items)
        setSelectedKeys(items.map((r) => r.key))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, lngLat]) // eslint-disable-line react-hooks/exhaustive-deps

  const columns: TableProps<OsmFeature>['columns'] = [
    {
      title: t('osm.colName'),
      dataIndex: 'label',
      ellipsis: true,
    },
    {
      title: t('osm.colGeom'),
      dataIndex: 'geomType',
      width: 110,
      render: (v: string) => {
        const color = v === 'Polygon' ? 'blue' : v === 'LineString' ? 'green' : 'orange'
        return <Tag color={color}>{v}</Tag>
      },
    },
  ]

  const handleImport = () => {
    const selected = rows.filter((r) => selectedKeys.includes(r.key)).map((r) => r.feature)
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: selected }
    const coords = lngLat ? `${lngLat[1].toFixed(4)},${lngLat[0].toFixed(4)}` : ''
    const name = `${t('osm.layerNamePrefix')} ${coords}`
    onImport(fc, name)
    onClose()
  }

  const footer = (
    <Space>
      <Button onClick={onClose}>{t('settings.save') === '保存' ? '取消' : 'Cancel'}</Button>
      <Button
        type="primary"
        disabled={selectedKeys.length === 0 || loading}
        onClick={handleImport}
      >
        {t('osm.importSelected')} ({selectedKeys.length})
      </Button>
    </Space>
  )

  return (
    <Modal
      title={t('osm.modalTitle')}
      open={open}
      onCancel={onClose}
      footer={footer}
      width={520}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#888', fontSize: 13 }}>{t('osm.loading')}</div>
        </div>
      )}
      {!loading && error && (
        <Alert type="error" message={t('osm.errorTitle')} description={error} showIcon />
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#888' }}>
          {t('osm.noFeatures')}
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <Table
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as string[]),
          }}
          columns={columns}
          dataSource={rows}
          size="small"
          pagination={false}
          scroll={{ y: 320 }}
        />
      )}
    </Modal>
  )
}
