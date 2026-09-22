import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import {
  Button,
  Callout,
  Dialog,
  DialogBody,
  FormGroup,
  InputGroup,
  Intent,
  NonIdealState,
  NumericInput,
  Spinner,
  Tab,
  Tabs,
  Tag,
} from '@blueprintjs/core'
import { useFlightStore, type FlightDataSource } from '../../stores/flightStore'
import { fetchAccessToken, testConnection as testOpenSky } from '../../services/opensky'
import { testAdsbfiConnection } from '../../services/adsbfi'

interface Props {
  open: boolean
  onClose: () => void
}

export default function FlightTrackingModal({ open, onClose }: Props): ReactElement {
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
    clear,
  } = useFlightStore()

  const [activeTab, setActiveTab] = useState<FlightDataSource>(dataSource)
  const [clientId, setClientId] = useState(openSkyConfig.clientId)
  const [clientSecret, setClientSecret] = useState(openSkyConfig.clientSecret)
  const [currentPollInterval, setCurrentPollInterval] = useState(pollInterval)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const flightCount = Object.keys(flights).length

  // Initialise inputs with last-saved config
  useEffect(() => {
    if (open) {
      setClientId(openSkyConfig.clientId)
      setClientSecret(openSkyConfig.clientSecret)
      setCurrentPollInterval(pollInterval)
      setActiveTab(dataSource)
      setTestResult(null)
    }
  }, [open, openSkyConfig, pollInterval, dataSource])

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
        let token: string | null = null
        if (clientId.trim() && clientSecret.trim()) {
          const tokenResp = await fetchAccessToken(clientId.trim(), clientSecret.trim())
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
      if (active) {
        clear()
        clearToken()
      }

      if (activeTab === 'opensky') {
        const cfg = {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }
        setOpenSkyConfig(cfg)
        setPollInterval(currentPollInterval)

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
        setPollInterval(currentPollInterval)
      }

      setDataSource(activeTab)
      setActive(true)
    } catch {
      // ignore
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

  const adsbfiContent = (
    <div style={{ paddingTop: 8 }}>
      <div
        style={{
          background: '#f0f7ff',
          border: '1px solid #d0e4f5',
          borderRadius: 3,
          padding: '10px 12px',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2329', marginBottom: 4 }}>
          adsb.fi 开放数据
        </div>
        <div style={{ fontSize: 11, color: '#646a73', lineHeight: '16px' }}>
          adsb.fi 提供免费、无需认证的航空器实时定位数据。基于当前地图视野中心点 + 视野半径自动获取数据。
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          <Tag minimal style={{ fontSize: 10 }}>无需认证</Tag>
          <Tag minimal style={{ fontSize: 10 }}>限速 1次/秒</Tag>
          <Tag minimal style={{ fontSize: 10 }}>最大半径 250 NM</Tag>
        </div>
      </div>

      <FormGroup label="刷新间隔（秒）">
        <NumericInput
          min={5}
          max={300}
          value={currentPollInterval}
          onValueChange={(val) => setCurrentPollInterval(val)}
          disabled={active}
          style={{ width: 140 }}
        />
      </FormGroup>
    </div>
  )

  const openSkyContent = (
    <div style={{ paddingTop: 8 }}>
      <div
        style={{
          background: '#f5f6f8',
          border: '1px solid #e5e7eb',
          borderRadius: 3,
          padding: '10px 12px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2329' }}>OAuth2 认证配置</span>
          <span style={{ fontSize: 11, color: '#8f959e' }}>可选 — 匿名模式有请求限制</span>
        </div>

        <FormGroup label="Client ID" style={{ marginBottom: 8 }}>
          <InputGroup
            leftIcon="key"
            placeholder="从 OpenSky Network 账户页获取"
            disabled={active}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </FormGroup>

        <FormGroup label="Client Secret" style={{ marginBottom: 0 }}>
          <InputGroup
            leftIcon="lock"
            type="password"
            placeholder="从 OpenSky Network 账户页获取"
            disabled={active}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </FormGroup>
      </div>

      <FormGroup label="刷新间隔（秒）">
        <NumericInput
          min={10}
          max={300}
          value={currentPollInterval}
          onValueChange={(val) => setCurrentPollInterval(val)}
          disabled={active}
          style={{ width: 140 }}
        />
      </FormGroup>
    </div>
  )

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>航空器定位数据接入</span>
          <Tag
            intent={active ? Intent.SUCCESS : Intent.NONE}
            minimal
            style={{ fontSize: 11 }}
          >
            {active ? `${sourceLabel} 跟踪中` : '未启动'}
          </Tag>
        </div>
      }
      icon="airplane"
      style={{ width: 560 }}
    >
      <DialogBody>
        <Tabs
          id="flight-tracking-tabs"
          selectedTabId={activeTab}
          onChange={handleTabChange}
        >
          <Tab
            id="adsbfi"
            title="adsb.fi"
            disabled={active && dataSource !== 'adsbfi'}
            panel={adsbfiContent}
          />
          <Tab
            id="opensky"
            title="OpenSky Network"
            disabled={active && dataSource !== 'opensky'}
            panel={openSkyContent}
          />
        </Tabs>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {!active ? (
            <>
              <Button
                style={{ flex: 1 }}
                icon="flash"
                text="测试连接"
                loading={testing}
                onClick={handleTestConnection}
              />
              <Button
                style={{ flex: 1 }}
                intent={Intent.PRIMARY}
                icon="rocket"
                text="开始跟踪"
                onClick={handleStart}
              />
            </>
          ) : (
            <Button
              fill
              intent={Intent.DANGER}
              icon="cross"
              text="停止跟踪"
              onClick={handleStop}
            />
          )}
        </div>

        {testResult && (
          <Callout
            intent={testResult.includes('❌') ? Intent.DANGER : Intent.SUCCESS}
            style={{ marginTop: 12 }}
          >
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{testResult}</pre>
          </Callout>
        )}

        {error && (
          <Callout intent={Intent.DANGER} style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12 }}>{error}</span>
          </Callout>
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
                borderBottom: '1px solid #ebebeb',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2329' }}>
                实时监控面板
                <span style={{ fontSize: 11, color: '#8f959e', fontWeight: 400, marginLeft: 8 }}>
                  数据源：{sourceLabel}
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#646a73' }}>
                {fetching && <Spinner size={14} />}
                <span>更新：{formatTime(lastUpdate)}</span>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  flex: 1,
                  background: '#f0f7ff',
                  padding: '8px 10px',
                  borderRadius: 3,
                  border: '1px solid #d0e4f5',
                }}
              >
                <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 2 }}>航空器总数</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1a6fb5' }}>{flightCount}</div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#eaf5ef',
                  padding: '8px 10px',
                  borderRadius: 3,
                  border: '1px solid #c8e6d5',
                }}
              >
                <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 2 }}>空中飞行</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2e8b57' }}>{airborne}</div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#fff7ed',
                  padding: '8px 10px',
                  borderRadius: 3,
                  border: '1px solid #f0d9b5',
                }}
              >
                <div style={{ fontSize: 10, color: '#8f959e', marginBottom: 2 }}>地面停靠</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#c57600' }}>{grounded}</div>
              </div>
            </div>

            {/* Aircraft list */}
            {flightCount === 0 ? (
              <div style={{ padding: '24px 0' }}>
                <NonIdealState
                  icon="airplane"
                  title={fetching ? '正在获取飞行数据...' : '当前视野内无航空器数据'}
                  layout="vertical"
                />
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
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
                        padding: '6px 8px',
                        borderRadius: 3,
                        border: '1px solid #e5e7eb',
                        background: '#ffffff',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 14, color: '#1a6fb5' }}>✈</span>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#1f2329',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
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
                        <span
                          style={{
                            background: '#f5f6f8',
                            padding: '1px 5px',
                            borderRadius: 2,
                            fontSize: 10,
                            color: '#1f2329',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          {f.baroAltitude != null ? `${Math.round(f.baroAltitude)}m` : '--'}
                        </span>
                        <span
                          style={{
                            background: '#f5f6f8',
                            padding: '1px 5px',
                            borderRadius: 2,
                            fontSize: 10,
                            color: '#1f2329',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          {f.velocity != null ? `${Math.round(f.velocity)}m/s` : '--'}
                        </span>
                        <Tag
                          minimal
                          intent={f.onGround ? Intent.WARNING : Intent.SUCCESS}
                          style={{ fontSize: 10 }}
                        >
                          {f.onGround ? '地面' : '飞行'}
                        </Tag>
                      </div>
                    </div>
                  ))}
                {flightCount > 50 && (
                  <div style={{ fontSize: 11, color: '#8f959e', textAlign: 'center', padding: 4 }}>
                    仅显示前 50 条，共 {flightCount} 架航空器
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogBody>
    </Dialog>
  )
}
