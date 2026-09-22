import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Classes,
  Dialog,
  DialogBody,
  DialogFooter,
  InputGroup,
  Intent,
  TextArea,
} from '@blueprintjs/core'
import { useTranslation } from 'react-i18next'
import { useLayerStore } from '../../stores/layerStore'
import { sqlCalculateField, parseApiError } from '../../services/api'
import { message } from '../../utils/toaster'

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
    <Dialog
      isOpen={open}
      onClose={onClose}
      title={t('fieldCalc.title')}
      style={{ width: 480 }}
    >
      <DialogBody>
        <div style={{ marginBottom: 12 }}>
          <div className={Classes.TEXT_MUTED} style={{ fontSize: 12, marginBottom: 4 }}>
            {t('fieldCalc.fieldName')}
          </div>
          <InputGroup
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder={t('fieldCalc.fieldPlaceholder')}
          />
        </div>
        <div>
          <div className={Classes.TEXT_MUTED} style={{ fontSize: 12, marginBottom: 4 }}>
            {t('fieldCalc.expression')}
          </div>
          <TextArea
            fill
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder={'round("pop" / 10000, 2)\nST_Area(geom)'}
            rows={3}
            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
          />
          <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, marginTop: 4 }}>
            {t('fieldCalc.hint')}
          </div>
        </div>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={onClose} text={t('common.cancel')} />
            <Button
              intent={Intent.PRIMARY}
              loading={running}
              onClick={handleOk}
              text={t('fieldCalc.run')}
            />
          </>
        }
      />
    </Dialog>
  )
}
