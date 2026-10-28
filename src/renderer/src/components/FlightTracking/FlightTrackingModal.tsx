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
        let credentials: { clientId: string; clientSecret: string } | null = null
        if (clientId.trim() && clientSecret.trim()) {
          credentials = { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
          const tokenResp = await fetchAccessToken(credentials.clientId, credentials.clientSecret)
          setTestResult(`✅ OAuth2 认证成功！Token 有效期 ${tokenResp.expires_in} 秒`)
        }

        const count = await testOpenSky(credentials)
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
      }

      if (activeTab === 'opensky') {
        const cfg = {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }
        setOpenSkyConfig(cfg)
        setPollInterval(currentPollInterval)

        // Verify credentials up-front when supplied (token is cached backend-side)
        if (cfg.clientId && cfg.clientSecret) {
          try {
            await fetchAccessToken(cfg.clientId, cfg.clientSecret)
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
          background: 'var(--color-primary-bg)',
          border: '1px solid var(--color-primary-border)',
          borderRadius: 'var(--radius)',
          padding: '10px 12px',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
          adsb.fi 开放数据
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: '16px' }}>
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
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '10px 12px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>OAuth2 认证配置</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>可选 — 匿名模式有请求限制</span>
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
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                实时监控面板
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 8 }}>
                  数据源：{sourceLabel}
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {fetching && <Spinner size={14} />}
                <span>更新：{formatTime(lastUpdate)}</span>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  flex: 1,
                  background: 'var(--color-primary-bg)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-primary-border)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>航空器总数</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)' }}>{flightCount}</div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: 'var(--color-success-bg)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-primary-border)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>空中飞行</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success)' }}>{airborne}</div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: 'var(--color-warning-bg)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-primary-border)',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>地面停靠</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-warning)' }}>{grounded}</div>
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
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-elevated)',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--color-primary)' }}>✈</span>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--color-text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {f.callsign || f.icao24}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                          {f.originCountry ? `${f.originCountry} · ` : ''}
                          {f.icao24}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <span
                          style={{
                            background: 'var(--color-bg-panel)',
                            padding: '1px 5px',
                            borderRadius: 2,
                            fontSize: 10,
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          {f.baroAltitude != null ? `${Math.round(f.baroAltitude)}m` : '--'}
                        </span>
                        <span
                          style={{
                            background: 'var(--color-bg-panel)',
                            padding: '1px 5px',
                            borderRadius: 2,
                            fontSize: 10,
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
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
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 4 }}>
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
