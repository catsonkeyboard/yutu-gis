import { useEffect, useRef } from 'react'
import { Modal, Form, Input, InputNumber, Radio, Button, Space, Typography } from 'antd'
import {
  WifiOutlined,
  DisconnectOutlined,
  CarOutlined,
  DashboardOutlined,
  CompassOutlined,
  NodeIndexOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useVehicleStore } from '../../stores/vehicleStore'
import { message } from 'antd'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
}

export default function VehicleTrackingModal({ open, onClose }: Props) {
  const [form] = Form.useForm()
  const protocol = Form.useWatch('protocol', form)
  const { connected, config, devices, setConnected, setConfig, updateDevice, clear } =
    useVehicleStore()

  const deviceCount = Object.keys(devices).length

  // Cleanup refs for IPC subscriptions
  const unsubDataRef = useRef<(() => void) | null>(null)
  const unsubErrorRef = useRef<(() => void) | null>(null)
  const unsubStartedRef = useRef<(() => void) | null>(null)
  const unsubStoppedRef = useRef<(() => void) | null>(null)

  // Subscribe to IPC events once on mount
  useEffect(() => {
    unsubDataRef.current = window.electronAPI.onVehicleData((packet) => {
      updateDevice(packet)
    })
    unsubErrorRef.current = window.electronAPI.onVehicleError((msg) => {
      message.error(`连接错误：${msg}`)
      setConnected(false)
    })
    unsubStartedRef.current = window.electronAPI.onVehicleStarted(() => {
      setConnected(true)
      message.success('已开始接收定位数据')
    })
    unsubStoppedRef.current = window.electronAPI.onVehicleStopped(() => {
      setConnected(false)
    })

    return () => {
      unsubDataRef.current?.()
      unsubErrorRef.current?.()
      unsubStartedRef.current?.()
      unsubStoppedRef.current?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise form with last-saved config
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        host: config.host,
        port: config.port,
        protocol: config.protocol
      })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    try {
      const values = await form.validateFields()
      const cfg = {
        host: (values.host as string).trim(),
        port: values.port as number,
        protocol: values.protocol as 'udp' | 'tcp'
      }
      setConfig(cfg)
      await window.electronAPI.startVehicleServer(cfg)
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return // validation error
      message.error(`启动失败：${(e as Error).message}`)
    }
  }

  const handleDisconnect = async () => {
    await window.electronAPI.stopVehicleServer()
    clear()
    message.info('已断开连接')
  }

  return (
    <Modal
      title={
        <Space size="middle">
          <CarOutlined style={{ color: '#1a6fb5' }} />
          <span>车辆定位接入</span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 10px',
              border: `1px solid ${connected ? '#2e8b57' : '#d9dce0'}`,
              background: connected ? '#eaf5ef' : '#f5f6f8',
              borderRadius: 2,
              fontSize: 12,
              fontWeight: 500,
              color: connected ? '#2e8b57' : '#8f959e'
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: connected ? '#2e8b57' : '#bbbfc4',
              }}
            />
            {connected ? '已连接' : '未连接'}
          </div>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose={false}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ host: config.host, port: config.port, protocol: config.protocol }}
        style={{ marginTop: 8 }}
      >
        <Form.Item
          label={<Text strong style={{ color: '#1f2329', fontSize: 12 }}>传输协议</Text>}
          name="protocol"
        >
          <Radio.Group disabled={connected} style={{ width: '100%', display: 'flex', gap: 8 }}>
            <Radio.Button
              value="udp"
              style={{
                flex: 1,
                textAlign: 'center',
                borderRadius: 2,
                height: 32,
                lineHeight: '30px',
                fontWeight: 500,
                fontSize: 13
              }}
            >
              UDP 协议
            </Radio.Button>
            <Radio.Button
              value="tcp"
              style={{
                flex: 1,
                textAlign: 'center',
                borderRadius: 2,
                height: 32,
                lineHeight: '30px',
                fontWeight: 500,
                fontSize: 13
              }}
            >
              TCP 协议
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Space style={{ width: '100%' }} size={12}>
          <Form.Item
            label={
              <Text strong style={{ color: '#1f2329', fontSize: 12 }}>
                {protocol === 'tcp' ? '服务器地址' : '监听地址'}
              </Text>
            }
            name="host"
            rules={[{ required: true, message: '请输入地址' }]}
            style={{ flex: 1, margin: 0 }}
          >
            <Input
              placeholder={protocol === 'tcp' ? '127.0.0.1' : '0.0.0.0'}
              disabled={connected}
              prefix={<NodeIndexOutlined style={{ color: '#8f959e' }} />}
              style={{ borderRadius: 2 }}
            />
          </Form.Item>
          <Form.Item
            label={
              <Text strong style={{ color: '#1f2329', fontSize: 12 }}>
                {protocol === 'tcp' ? '服务器端口' : '监听端口'}
              </Text>
            }
            name="port"
            rules={[{ required: true, message: '请输入端口' }]}
            style={{ flex: 1, margin: 0 }}
          >
            <InputNumber
              min={1}
              max={65535}
              style={{ width: '100%', borderRadius: 2 }}
              placeholder="5000"
              disabled={connected}
              prefix={<CompassOutlined style={{ color: '#8f959e', marginRight: 4 }} />}
            />
          </Form.Item>
        </Space>

        <div style={{ marginTop: 16 }}>
          {!connected ? (
            <Button
              type="primary"
              block
              icon={<RocketOutlined />}
              onClick={handleConnect}
              style={{
                height: 34,
                borderRadius: 2,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              开始连接
            </Button>
          ) : (
            <Button
              danger
              block
              icon={<DisconnectOutlined />}
              onClick={handleDisconnect}
              style={{
                height: 34,
                borderRadius: 2,
                fontSize: 13,
                fontWeight: 500
              }}
            >
              断开连接
            </Button>
          )}
        </div>
      </Form>

      {/* Real-time Status */}
      {connected && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              padding: '6px 0',
              borderBottom: '1px solid #ebebeb',
            }}
          >
            <Text strong style={{ fontSize: 13, color: '#1f2329' }}>
              <DashboardOutlined style={{ marginRight: 6, color: '#1a6fb5' }} />
              实时数据面板
            </Text>
            <Text style={{ fontSize: 12, color: '#646a73' }}>
              跟踪车辆：{deviceCount}
            </Text>
          </div>

          {deviceCount === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                background: '#f5f6f8',
                border: '1px dashed #d9dce0',
                borderRadius: 2
              }}
            >
              <WifiOutlined style={{ fontSize: 18, color: '#8f959e', marginBottom: 8, display: 'block' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                正在等待车辆数据接入...
              </Text>
            </div>
          ) : (
            <div
              style={{
                maxHeight: 240,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              {Object.values(devices).map((d) => (
                <div
                  key={d.devNo}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px 12px',
                    borderRadius: 2,
                    border: '1px solid #d9dce0',
                    background: '#ffffff',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8
                    }}
                  >
                    <Space size={6}>
                      <CarOutlined style={{ color: '#1a6fb5', fontSize: 13 }} />
                      <Text
                        strong
                        style={{
                          fontSize: 13,
                          color: '#1f2329',
                        }}
                      >
                        {d.devNo}
                      </Text>
                    </Space>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: '#2e8b57',
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    >
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: '#2e8b57'
                        }}
                      />
                      活跃
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        background: '#f5f6f8',
                        padding: '5px 8px',
                        borderRadius: 2,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 1 }}>
                        速度
                      </div>
                      <div style={{ color: '#1f2329', fontWeight: 600, fontSize: 13 }}>
                        {d.speed}{' '}
                        <span style={{ fontSize: 10, color: '#8f959e', fontWeight: 'normal' }}>
                          km/h
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: '#f5f6f8',
                        padding: '5px 8px',
                        borderRadius: 2,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 1 }}>
                        方向
                      </div>
                      <div style={{ color: '#1f2329', fontWeight: 600, fontSize: 13 }}>
                        {d.direct}°
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1.5,
                        background: '#f5f6f8',
                        padding: '5px 8px',
                        borderRadius: 2,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 1 }}>
                        坐标
                      </div>
                      <div
                        style={{
                          color: '#1f2329',
                          fontWeight: 500,
                          fontSize: 12,
                          fontFamily: 'var(--font-mono, monospace)'
                        }}
                      >
                        {d.lat.toFixed(5)}, {d.lon.toFixed(5)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
