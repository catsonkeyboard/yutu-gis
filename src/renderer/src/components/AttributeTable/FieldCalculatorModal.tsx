import { useState } from 'react'
import type { ReactElement } from 'react'
import { Input, Modal, Typography, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useLayerStore } from '../../stores/layerStore'
import { sqlCalculateField, parseApiError } from '../../services/api'

const { Text } = Typography

interface Props {
  open: boolean
  layerId: string | null
  onClose: () => void
}

export default function FieldCalculatorModal({ open, layerId, onClose }: Props): ReactElement {
  const { t } = useTranslation()
  const setSource = useLayerStore((s) => s.setSource)
  const [field, setField] = useState('')
  const [expression, setExpression] = useState('')
  const [running, setRunning] = useState(false)

  const handleOk = async () => {
    const layer = useLayerStore.getState().layers.find((l) => l.id === layerId)
    if (!layer || layer.type !== 'geojson') return
    if (!field.trim() || !expression.trim()) {
      message.warning(t('fieldCalc.required'))
      return
    }
    setRunning(true)
    try {
      const fc = await sqlCalculateField(
        layer.source as GeoJSON.FeatureCollection,
        expression,
        field.trim()
      )
      setSource(layer.id, fc)
      message.success(t('fieldCalc.done', { field: field.trim() }))
      setField('')
      setExpression('')
      onClose()
    } catch (e) {
      message.error(parseApiError(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      title={t('fieldCalc.title')}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={t('fieldCalc.run')}
      cancelText={t('common.cancel')}
      confirmLoading={running}
      width={480}
    >
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('fieldCalc.fieldName')}
        </Text>
        <Input
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder={t('fieldCalc.fieldPlaceholder')}
          style={{ marginTop: 4 }}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('fieldCalc.expression')}
        </Text>
        <Input.TextArea
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder={'round("pop" / 10000, 2)\nST_Area(geom)'}
          rows={3}
          style={{ marginTop: 4, fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }}
        />
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('fieldCalc.hint')}
        </Text>
      </div>
    </Modal>
  )
}
