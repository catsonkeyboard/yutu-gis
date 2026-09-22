import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  FormGroup,
  InputGroup,
  Intent,
  NonIdealState,
  NumericInput,
  SegmentedControl,
  Tag,
} from '@blueprintjs/core'
import { useVehicleStore } from '../../stores/vehicleStore'
import { message } from '../../utils/toaster'

interface Props {
  open: boolean
  onClose: () => void
}

export default function VehicleTrackingModal({ open, onClose }: Props): ReactElement {
  const { connected, config, devices, setConnected, setConfig, updateDevice, clear } =
    useVehicleStore()

  const [protocol, setProtocol] = useState<'udp' | 'tcp'>(config.protocol)
  const [host, setHost] = useState(config.host)
  const [port, setPort] = useState<number>(config.port)

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
  }, [setConnected, updateDevice])

  // Initialise inputs with last-saved config
  useEffect(() => {
    if (open) {
      setHost(config.host)
      setPort(config.port)
      setProtocol(config.protocol)
    }
  }, [open, config])

  const handleConnect = async () => {
    const trimmedHost = host.trim()
    if (!trimmedHost) {
      message.warning('请输入服务器地址')
      return
    }
    if (!port || port < 1 || port > 65535) {
      message.warning('请输入有效端口号 (1-65535)')
      return
    }
    try {
      const cfg = {
        host: trimmedHost,
        port,
        protocol,
      }
      setConfig(cfg)
      await window.electronAPI.startVehicleServer(cfg)
    } catch (e) {
      message.error(`启动失败：${(e as Error).message}`)
    }
  }

  const handleDisconnect = async () => {
    await window.electronAPI.stopVehicleServer()
    clear()
    message.info('已断开连接')
  }

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>车辆定位接入</span>
          <Tag
            intent={connected ? Intent.SUCCESS : Intent.NONE}
            minimal
            style={{ fontSize: 11 }}
          >
            {connected ? '已连接' : '未连接'}
          </Tag>
        </div>
      }
      icon="drive-time"
      style={{ width: 500 }}
    >
      <DialogBody>
        <FormGroup label="传输协议">
          <SegmentedControl
            disabled={connected}
            value={protocol}
            onValueChange={(val) => setProtocol(val as 'udp' | 'tcp')}
            options={[
              { value: 'udp', label: 'UDP 协议' },
              { value: 'tcp', label: 'TCP 协议' },
            ]}
          />
        </FormGroup>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormGroup label={protocol === 'tcp' ? '服务器地址' : '监听地址'}>
              <InputGroup
                leftIcon="ip-address"
                disabled={connected}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={protocol === 'tcp' ? '127.0.0.1' : '0.0.0.0'}
              />
            </FormGroup>
          </div>
          <div style={{ width: 140 }}>
            <FormGroup label={protocol === 'tcp' ? '服务器端口' : '监听端口'}>
              <NumericInput
                fill
                leftIcon="compass"
                disabled={connected}
                min={1}
                max={65535}
                value={port}
                onValueChange={(val) => setPort(val)}
                placeholder="5000"
              />
            </FormGroup>
          </div>
        </div>

        <div style={{ marginTop: 4 }}>
          {!connected ? (
            <Button
              intent={Intent.PRIMARY}
              fill
              icon="rocket"
              text="开始连接"
              onClick={handleConnect}
              style={{ height: 32 }}
            />
          ) : (
            <Button
              intent={Intent.DANGER}
              fill
              icon="cross"
              text="断开连接"
              onClick={handleDisconnect}
              style={{ height: 32 }}
            />
          )}
        </div>

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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2329' }}>
                实时数据面板
              </span>
              <span style={{ fontSize: 12, color: '#646a73' }}>
                跟踪车辆：{deviceCount}
              </span>
            </div>

            {deviceCount === 0 ? (
              <div style={{ padding: '24px 0' }}>
                <NonIdealState
                  icon="cell-tower"
                  title="正在等待车辆数据接入..."
                  layout="vertical"
                />
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 240,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {Object.values(devices).map((d) => (
                  <div
                    key={d.devNo}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '8px 10px',
                      borderRadius: 3,
                      border: '1px solid #d9dce0',
                      background: '#ffffff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2329' }}>
                        {d.devNo}
                      </span>
                      <Tag intent={Intent.SUCCESS} minimal style={{ fontSize: 10 }}>
                        活跃
                      </Tag>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <div
                        style={{
                          flex: 1,
                          background: '#f5f6f8',
                          padding: '4px 8px',
                          borderRadius: 2,
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 1 }}>速度</div>
                        <div style={{ color: '#1f2329', fontWeight: 600, fontSize: 12 }}>
                          {d.speed} <span style={{ fontSize: 10, fontWeight: 'normal', color: '#8f959e' }}>km/h</span>
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          background: '#f5f6f8',
                          padding: '4px 8px',
                          borderRadius: 2,
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 1 }}>方向</div>
                        <div style={{ color: '#1f2329', fontWeight: 600, fontSize: 12 }}>
                          {d.direct}°
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1.5,
                          background: '#f5f6f8',
                          padding: '4px 8px',
                          borderRadius: 2,
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 1 }}>坐标</div>
                        <div
                          style={{
                            color: '#1f2329',
                            fontWeight: 500,
                            fontSize: 11,
                            fontFamily: 'Menlo, Consolas, monospace',
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
      </DialogBody>
    </Dialog>
  )
}
