import { useState, useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Button, Space, Typography, Alert, Spin, Tabs } from 'antd'
import {
  RocketOutlined,
  DisconnectOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  KeyOutlined,
  LockOutlined,
  FieldTimeOutlined,
  CloudOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useFlightStore, type FlightDataSource } from '../../stores/flightStore'
import { fetchAccessToken, testConnection as testOpenSky } from '../../services/opensky'
import { testAdsbfiConnection } from '../../services/adsbfi'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
}

export default function FlightTrackingModal({ open, onClose }: Props) {
  const [openSkyForm] = Form.useForm()
  const [adsbfiForm] = Form.useForm()
  const {
    active,
    dataSource,
    pollInterval,
    openSkyConfig,
    flights,
    lastUpdate,
    error,
    fetching,
    setActive,
    setDataSource,
    setPollInterval,
    setOpenSkyConfig,
    setToken,
    clearToken,
    setError,
    clear
  } = useFlightStore()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FlightDataSource>(dataSource)

  const flightCount = Object.keys(flights).length

  // Initialise forms with last-saved config
  useEffect(() => {
    if (open) {
      openSkyForm.setFieldsValue({
        clientId: openSkyConfig.clientId,
        clientSecret: openSkyConfig.clientSecret,
        pollInterval: pollInterval
      })
      adsbfiForm.setFieldsValue({
        pollInterval: pollInterval
      })
      setActiveTab(dataSource)
      setTestResult(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (key: string) => {
    if (active) return // Don't allow switching while active
    setActiveTab(key as FlightDataSource)
    setTestResult(null)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      if (activeTab === 'opensky') {
        const values = await openSkyForm.validateFields(['clientId', 'clientSecret'])
        const clientId = (values.clientId as string)?.trim()
        const clientSecret = (values.clientSecret as string)?.trim()

        let token: string | null = null
        if (clientId && clientSecret) {
          const tokenResp = await fetchAccessToken(clientId, clientSecret)
          token = tokenResp.access_token
          setTestResult(`✅ OAuth2 认证成功！Token 有效期 ${tokenResp.expires_in} 秒`)
          setToken(token, tokenResp.expires_in)
        }

        const count = await testOpenSky(token)
        setTestResult(
          (prev) =>
            (prev ? prev + '\n' : '') + `✅ OpenSky API 连接正常，测试区域发现 ${count} 架航空器`
        )
      } else {
        const count = await testAdsbfiConnection()
        setTestResult(`✅ adsb.fi API 连接正常，测试区域发现 ${count} 架航空器`)
      }
    } catch (err) {
      setTestResult(`❌ 连接失败：${(err as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  const handleStart = async () => {
    try {
      // Stop any existing tracking first
      if (active) {
        clear()
        clearToken()
      }

      if (activeTab === 'opensky') {
        const values = await openSkyForm.validateFields()
        const cfg = {
          clientId: ((values.clientId as string) ?? '').trim(),
          clientSecret: ((values.clientSecret as string) ?? '').trim()
        }
        setOpenSkyConfig(cfg)
        setPollInterval(values.pollInterval as number)

        // If credentials provided, pre-fetch token
        if (cfg.clientId && cfg.clientSecret) {
          try {
            const tokenResp = await fetchAccessToken(cfg.clientId, cfg.clientSecret)
            setToken(tokenResp.access_token, tokenResp.expires_in)
          } catch (err) {
            setError(`Token 获取失败：${(err as Error).message}`)
            return
          }
        }
      } else {
        const values = await adsbfiForm.validateFields()
        setPollInterval(values.pollInterval as number)
      }

      setDataSource(activeTab)
      setActive(true)
    } catch {
      // form validation error
    }
  }

  const handleStop = () => {
    clear()
    clearToken()
  }

  const formatTime = (ts: number | null) => {
    if (!ts) return '--'
    return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
  }

  const airborne = Object.values(flights).filter((f) => !f.onGround).length
  const grounded = Object.values(flights).filter((f) => f.onGround).length

  const sourceLabel = dataSource === 'opensky' ? 'OpenSky Network' : 'adsb.fi'

  // ── OpenSky tab content ──────────────────────────────────────────────────
  const openSkyContent = (
    <Form
      form={openSkyForm}
      layout="vertical"
      initialValues={{
        clientId: openSkyConfig.clientId,
        clientSecret: openSkyConfig.clientSecret,
        pollInterval: pollInterval
      }}
    >
      {/* Auth section */}
      <div
        style={{
          background: '#f5f6f8',
          border: '1px solid #e5e7eb',
          borderRadius: 2,
          padding: '12px 14px',
          marginBottom: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <SafetyCertificateOutlined style={{ color: '#1a6fb5', fontSize: 13 }} />
          <Text strong style={{ fontSize: 12, color: '#1f2329' }}>
            OAuth2 认证配置
          </Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
            可选 — 匿名模式有请求限制
          </Text>
        </div>

        <Form.Item
          label={
            <Text strong style={{ color: '#1f2329', fontSize: 12 }}>
              Client ID
            </Text>
          }
          name="clientId"
          style={{ marginBottom: 10 }}
        >
          <Input
            placeholder="从 OpenSky Network 账户页获取"
            disabled={active}
            prefix={<KeyOutlined style={{ color: '#8f959e' }} />}
            style={{ borderRadius: 2 }}
          />
        </Form.Item>

        <Form.Item
          label={
            <Text strong style={{ color: '#1f2329', fontSize: 12 }}>
              Client Secret
            </Text>
          }
          name="clientSecret"
          style={{ marginBottom: 0 }}
        >
          <Input.Password
            placeholder="从 OpenSky Network 账户页获取"
            disabled={active}
            prefix={<LockOutlined style={{ color: '#8f959e' }} />}
            style={{ borderRadius: 2 }}
          />
        </Form.Item>
      </div>

      <Form.Item
        label={
          <Space size={4}>
            <FieldTimeOutlined style={{ color: '#8f959e' }} />
            <Text strong style={{ color: '#1f2329', fontSize: 12 }}>
              刷新间隔（秒）
            </Text>
          </Space>
        }
        name="pollInterval"
        rules={[{ required: true, message: '请设置刷新间隔' }]}
        style={{ marginBottom: 0 }}
      >
        <InputNumber
          min={10}
          max={300}
          style={{ width: '100%', borderRadius: 2 }}
          placeholder="15"
          disabled={active}
          addonAfter="秒"
        />
      </Form.Item>
    </Form>
  )

  // ── adsb.fi tab content ──────────────────────────────────────────────────
  const adsbfiContent = (
    <Form form={adsbfiForm} layout="vertical" initialValues={{ pollInterval: pollInterval }}>
      <div
        style={{
          background: '#f0f7ff',
          border: '1px solid #d0e4f5',
          borderRadius: 2,
          padding: '12px 14px',
          marginBottom: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <GlobalOutlined style={{ color: '#1a6fb5', fontSize: 13 }} />
          <Text strong style={{ fontSize: 12, color: '#1f2329' }}>
            adsb.fi 开放数据
          </Text>
        </div>
        <Text type="secondary" style={{ fontSize: 12, lineHeight: '18px' }}>
          adsb.fi 提供免费、无需认证的航空器实时定位数据。 基于当前地图视野中心点 +
          视野半径自动获取数据。
        </Text>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #d0e4f5',
              borderRadius: 2,
              padding: '2px 8px',
              fontSize: 11,
              color: '#646a73'
            }}
          >
            无需认证
          </div>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #d0e4f5',
              borderRadius: 2,
              padding: '2px 8px',
              fontSize: 11,
              color: '#646a73'
            }}
          >
            限速 1次/秒
          </div>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #d0e4f5',
              borderRadius: 2,
              padding: '2px 8px',
              fontSize: 11,
              color: '#646a73'
            }}
          >
            最大半径 250 NM
          </div>
        </div>
      </div>

      <Form.Item
        label={
          <Space size={4}>
            <FieldTimeOutlined style={{ color: '#8f959e' }} />
            <Text strong style={{ color: '#1f2329', fontSize: 12 }}>
              刷新间隔（秒）
            </Text>
          </Space>
        }
        name="pollInterval"
        rules={[{ required: true, message: '请设置刷新间隔' }]}
        style={{ marginBottom: 0 }}
      >
        <InputNumber
          min={5}
          max={300}
          style={{ width: '100%', borderRadius: 2 }}
          placeholder="10"
          disabled={active}
          addonAfter="秒"
        />
      </Form.Item>
    </Form>
  )

  return (
    <Modal
      title={
        <Space size="middle">
          <CloudOutlined style={{ color: '#1a6fb5' }} />
          <span>航空器定位数据接入</span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 10px',
              border: `1px solid ${active ? '#2e8b57' : '#d9dce0'}`,
              background: active ? '#eaf5ef' : '#f5f6f8',
              borderRadius: 2,
              fontSize: 12,
              fontWeight: 500,
              color: active ? '#2e8b57' : '#8f959e'
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: active ? '#2e8b57' : '#bbbfc4'
              }}
            />
            {active ? `${sourceLabel} 跟踪中` : '未启动'}
          </div>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose={false}
    >
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        style={{ marginTop: -4 }}
        items={[
          {
            key: 'adsbfi',
            label: (
              <Space size={4}>
                <GlobalOutlined />
                <span>adsb.fi</span>
              </Space>
            ),
            disabled: active && dataSource !== 'adsbfi',
            children: adsbfiContent
          },
          {
            key: 'opensky',
            label: (
              <Space size={4}>
                <CloudOutlined />
                <span>OpenSky Network</span>
              </Space>
            ),
            disabled: active && dataSource !== 'opensky',
            children: openSkyContent
          }
        ]}
      />

      {/* Test + Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {!active ? (
          <>
            <Button
              block
              icon={<ThunderboltOutlined />}
              onClick={handleTestConnection}
              loading={testing}
              style={{
                height: 34,
                borderRadius: 2,
                fontSize: 13,
                fontWeight: 500
              }}
            >
              测试连接
            </Button>
            <Button
              type="primary"
              block
              icon={<RocketOutlined />}
              onClick={handleStart}
              style={{
                height: 34,
                borderRadius: 2,
                fontSize: 13,
                fontWeight: 500
              }}
            >
              开始跟踪
            </Button>
          </>
        ) : (
          <Button
            danger
            block
            icon={<DisconnectOutlined />}
            onClick={handleStop}
            style={{
              height: 34,
              borderRadius: 2,
              fontSize: 13,
              fontWeight: 500
            }}
          >
            停止跟踪
          </Button>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <Alert
          type={testResult.includes('❌') ? 'error' : 'success'}
          message={testResult}
          showIcon
          closable
          onClose={() => setTestResult(null)}
          style={{ marginTop: 12, borderRadius: 2, whiteSpace: 'pre-line' }}
        />
      )}

      {/* Error display */}
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginTop: 12, borderRadius: 2 }}
        />
      )}

      {/* Real-time status panel */}
      {active && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              padding: '6px 0',
              borderBottom: '1px solid #ebebeb'
            }}
          >
            <Text strong style={{ fontSize: 13, color: '#1f2329' }}>
              <DashboardOutlined style={{ marginRight: 6, color: '#1a6fb5' }} />
              实时监控面板
              <span style={{ fontSize: 11, color: '#8f959e', fontWeight: 400, marginLeft: 8 }}>
                数据源：{sourceLabel}
              </span>
            </Text>
            <Space size={12}>
              {fetching && <Spin size="small" />}
              <Text style={{ fontSize: 12, color: '#646a73' }}>更新：{formatTime(lastUpdate)}</Text>
            </Space>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div
              style={{
                flex: 1,
                background: '#f0f7ff',
                padding: '10px 12px',
                borderRadius: 2,
                border: '1px solid #d0e4f5'
              }}
            >
              <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 2 }}>航空器总数</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a6fb5' }}>{flightCount}</div>
            </div>
            <div
              style={{
                flex: 1,
                background: '#eaf5ef',
                padding: '10px 12px',
                borderRadius: 2,
                border: '1px solid #c8e6d5'
              }}
            >
              <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 2 }}>空中飞行</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#2e8b57' }}>{airborne}</div>
            </div>
            <div
              style={{
                flex: 1,
                background: '#fff7ed',
                padding: '10px 12px',
                borderRadius: 2,
                border: '1px solid #f0d9b5'
              }}
            >
              <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 2 }}>地面停靠</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#c57600' }}>{grounded}</div>
            </div>
          </div>

          {/* Aircraft list */}
          {flightCount === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                background: '#f5f6f8',
                border: '1px dashed #d9dce0',
                borderRadius: 2
              }}
            >
              <CloudOutlined
                style={{ fontSize: 18, color: '#8f959e', marginBottom: 8, display: 'block' }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {fetching ? '正在获取飞行数据...' : '当前视野内无航空器数据'}
              </Text>
            </div>
          ) : (
            <div
              style={{
                maxHeight: 240,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              {Object.values(flights)
                .slice(0, 50)
                .map((f) => (
                  <div
                    key={f.icao24}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px 10px',
                      borderRadius: 2,
                      border: '1px solid #e5e7eb',
                      background: '#ffffff',
                      gap: 8
                    }}
                  >
                    <div style={{ flex: '0 0 auto', fontSize: 14, color: '#1a6fb5' }}>✈</div>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#1f2329',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {f.callsign || f.icao24}
                      </div>
                      <div style={{ fontSize: 10, color: '#8f959e' }}>
                        {f.originCountry ? `${f.originCountry} · ` : ''}
                        {f.icao24}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <div
                        style={{
                          background: '#f5f6f8',
                          padding: '2px 6px',
                          borderRadius: 2,
                          fontSize: 10,
                          color: '#1f2329',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        {f.baroAltitude != null ? `${Math.round(f.baroAltitude)}m` : '--'}
                      </div>
                      <div
                        style={{
                          background: '#f5f6f8',
                          padding: '2px 6px',
                          borderRadius: 2,
                          fontSize: 10,
                          color: '#1f2329',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        {f.velocity != null ? `${Math.round(f.velocity)}m/s` : '--'}
                      </div>
                      <div
                        style={{
                          background: f.onGround ? '#fff7ed' : '#eaf5ef',
                          padding: '2px 6px',
                          borderRadius: 2,
                          fontSize: 10,
                          fontWeight: 500,
                          color: f.onGround ? '#c57600' : '#2e8b57',
                          border: `1px solid ${f.onGround ? '#f0d9b5' : '#c8e6d5'}`
                        }}
                      >
                        {f.onGround ? '地面' : '飞行'}
                      </div>
                    </div>
                  </div>
                ))}
              {flightCount > 50 && (
                <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', padding: 4 }}>
                  仅显示前 50 条，共 {flightCount} 架航空器
                </Text>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
