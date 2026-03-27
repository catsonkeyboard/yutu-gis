import { useState } from 'react'
import {
  Modal, Form, Input, Select, InputNumber, Button,
  Radio, Alert, Progress, Typography,
} from 'antd'
import { LinkOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  wfsGetLayers, wfsGetFeatures,
  ogcGetCollections, ogcGetFeatures,
  type WFSLayer, type OGCCollection,
} from '../../services/api'

const { Text } = Typography

type ServiceType = 'wfs' | 'ogc'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (geojson: GeoJSON.FeatureCollection, name: string) => void
}

export default function WFSModal({ open, onClose, onImport }: Props) {
  const [form] = Form.useForm()
  const [serviceType, setServiceType] = useState<ServiceType>('wfs')
  const [fetching, setFetching] = useState(false)
  const [wfsLayers, setWfsLayers] = useState<WFSLayer[]>([])
  const [ogcCollections, setOgcCollections] = useState<OGCCollection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const handleGetList = async () => {
    const url = form.getFieldValue('url')?.trim()
    if (!url) { form.validateFields(['url']); return }
    setFetching(true)
    setError(null)
    try {
      if (serviceType === 'wfs') {
        const layers = await wfsGetLayers(url)
        setWfsLayers(layers)
        form.setFieldValue('typeNames', [])
      } else {
        const cols = await ogcGetCollections(url)
        setOgcCollections(cols)
        form.setFieldValue('collectionIds', [])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const handleImport = async () => {
    const values = await form.validateFields()
    setError(null)

    const maxFeatures: number = values.maxFeatures ?? 1000
    const url: string = values.url

    // Collect items to import
    const items: { key: string; name: string }[] =
      serviceType === 'wfs'
        ? (values.typeNames as string[]).map((t) => ({
            key: t,
            name: t.split(':').pop() ?? t,
          }))
        : (values.collectionIds as string[]).map((id) => ({ key: id, name: id }))

    if (items.length === 0) return

    setProgress({ current: 0, total: items.length })
    const errors: string[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setProgress({ current: i + 1, total: items.length })
      try {
        const geojson =
          serviceType === 'wfs'
            ? await wfsGetFeatures(url, item.key, maxFeatures)
            : await ogcGetFeatures(url, item.key, maxFeatures)
        onImport(geojson, item.name)
      } catch (e) {
        errors.push(`${item.name}: ${(e as Error).message}`)
      }
    }

    setProgress(null)

    if (errors.length > 0) {
      setError(errors.join('\n'))
    } else {
      handleClose()
    }
  }

  const handleClose = () => {
    form.resetFields()
    setWfsLayers([])
    setOgcCollections([])
    setError(null)
    setProgress(null)
    onClose()
  }

  const importing = progress !== null

  return (
    <Modal
      title={<><LinkOutlined style={{ marginRight: 8 }} />连接 WFS / OGC API Features</>}
      open={open}
      onCancel={handleClose}
      width={540}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={handleClose} disabled={importing}>取消</Button>,
        <Button key="import" type="primary" loading={importing} onClick={handleImport}>
          {importing
            ? `导入中 ${progress.current}/${progress.total}`
            : '导入图层'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" initialValues={{ maxFeatures: 1000 }} style={{ marginTop: 8 }}>
        {/* Service type */}
        <Form.Item label="接口类型">
          <Radio.Group
            value={serviceType}
            onChange={(e) => {
              setServiceType(e.target.value)
              setWfsLayers([])
              setOgcCollections([])
              setError(null)
              form.setFieldValue('typeNames', [])
              form.setFieldValue('collectionIds', [])
            }}
          >
            <Radio value="wfs">WFS 1.x / 2.x</Radio>
            <Radio value="ogc">OGC API Features</Radio>
          </Radio.Group>
        </Form.Item>

        {/* URL */}
        <Form.Item label="服务地址" required style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item
              name="url"
              noStyle
              rules={[{ required: true, message: '请输入服务地址' }]}
            >
              <Input
                placeholder={
                  serviceType === 'wfs'
                    ? 'https://example.com/geoserver/ows'
                    : 'https://example.com/ogcapi'
                }
                allowClear
              />
            </Form.Item>
            <Button icon={<ReloadOutlined />} loading={fetching} onClick={handleGetList}>
              {serviceType === 'wfs' ? '获取图层' : '获取集合'}
            </Button>
          </div>
        </Form.Item>
        <div style={{ marginBottom: 12 }} />

        <div style={{ borderBottom: '1px solid #f0f0f0', margin: '4px 0 12px' }} />

        {/* WFS: TypeNames — multi-select */}
        {serviceType === 'wfs' && (
          <Form.Item
            name="typeNames"
            label={
              <span>
                图层名称 (TypeName)
                <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  可多选，每个生成独立图层
                </Text>
              </span>
            }
            rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个图层' }]}
          >
            <Select
              mode={wfsLayers.length > 0 ? 'multiple' : 'tags'}
              showSearch
              allowClear
              placeholder={wfsLayers.length > 0 ? '选择图层（可多选）' : '输入图层名后按 Enter，可添加多个'}
              options={wfsLayers.map((l) => ({
                value: l.name,
                label: (
                  <span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{l.name}</Text>
                    {l.title !== l.name && <span style={{ marginLeft: 6 }}>{l.title}</span>}
                  </span>
                ),
              }))}
              filterOption={(input, opt) =>
                String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        )}

        {/* OGC: Collection IDs — multi-select */}
        {serviceType === 'ogc' && (
          <Form.Item
            name="collectionIds"
            label={
              <span>
                集合 ID (Collection)
                <Text type="secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  可多选，每个生成独立图层
                </Text>
              </span>
            }
            rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个集合' }]}
          >
            <Select
              mode={ogcCollections.length > 0 ? 'multiple' : 'tags'}
              showSearch
              allowClear
              placeholder={ogcCollections.length > 0 ? '选择集合（可多选）' : '输入集合 ID 后按 Enter，可添加多个'}
              options={ogcCollections.map((c) => ({
                value: c.id,
                label: (
                  <span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{c.id}</Text>
                    {c.title !== c.id && <span style={{ marginLeft: 6 }}>{c.title}</span>}
                  </span>
                ),
              }))}
              filterOption={(input, opt) =>
                String(opt?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        )}

        {/* Max features — per layer */}
        <Form.Item name="maxFeatures" label="每个图层最大要素数">
          <InputNumber min={1} max={100000} style={{ width: 180 }} />
        </Form.Item>

        {/* Import progress */}
        {importing && (
          <Progress
            percent={Math.round((progress.current / progress.total) * 100)}
            status="active"
            size="small"
            format={() => `${progress.current} / ${progress.total}`}
          />
        )}

        {error && (
          <Alert
            type="error"
            message="部分图层导入失败"
            description={<pre style={{ fontSize: 12, margin: 0 }}>{error}</pre>}
            showIcon
            style={{ marginTop: 8 }}
          />
        )}
      </Form>
    </Modal>
  )
}
