import { Modal, Form, Input, Select, Divider, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settingsStore'
import i18n from '../../i18n'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const { language, apiKeys, setLanguage, setApiKeys } = useSettingsStore()
  const [form] = Form.useForm()

  const handleOk = async () => {
    const values = await form.validateFields()
    setLanguage(values.language)
    setApiKeys({ google: values.googleKey ?? '', amap: values.amapKey ?? '' })
    await i18n.changeLanguage(values.language)
    await window.electronAPI.saveConfig({
      language: values.language,
      googleMap: { apiKey: values.googleKey ?? '' },
      amap: { apiKey: values.amapKey ?? '' },
    })
    onClose()
  }

  return (
    <Modal
      title={t('settings.title')}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={t('settings.save')}
      width={480}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          language,
          googleKey: apiKeys.google,
          amapKey: apiKeys.amap,
        }}
        style={{ marginTop: 16 }}
      >
        <Form.Item name="language" label={t('settings.language')}>
          <Select
            options={[
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
            style={{ width: 200 }}
          />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('settings.apiKeys')}
          </Text>
        </Divider>

        <Form.Item
          name="googleKey"
          label={t('settings.googleKey')}
          extra="用于 Google Maps 街道图和影像图"
        >
          <Input.Password placeholder="AIzaSy..." autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="amapKey"
          label={t('settings.amapKey')}
          extra="用于高德地图（当前使用公共服务，无需 Key）"
        >
          <Input.Password placeholder="your-amap-key" autoComplete="off" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
