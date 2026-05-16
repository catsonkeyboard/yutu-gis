type AppConfig = { language: 'zh' | 'en'; googleMap: { apiKey: string }; amap: { apiKey: string } }
type VehicleServerConfig = { host: string; port: number; protocol: 'udp' | 'tcp' }
type VehiclePacket = { time: number; devNo: string; direct: number; speed: number; lat: number; lon: number }
type OpenSkyBounds = { lamin: number; lomin: number; lamax: number; lomax: number }
type OpenSkyTokenResult = { access_token: string; expires_in: number }
type OpenSkyStatesResult = { time: number; states: unknown[][] | null }

export interface ElectronAPI {
  getPythonPort: () => Promise<number>
  readFile: (filePath: string) => Promise<Buffer>
  writeFile: (filePath: string, content: string) => Promise<void>
  openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  saveFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  openDirectoryDialog: () => Promise<string | null>
  onMenuAction: (callback: (action: string) => void) => () => void
  loadConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  // Vehicle tracking
  startVehicleServer: (config: VehicleServerConfig) => Promise<void>
  stopVehicleServer: () => Promise<void>
  onVehicleData: (callback: (packet: VehiclePacket) => void) => () => void
  onVehicleError: (callback: (msg: string) => void) => () => void
  onVehicleStarted: (callback: () => void) => () => void
  onVehicleStopped: (callback: () => void) => () => void
  // OpenSky Network
  openSkyFetchToken: (clientId: string, clientSecret: string) => Promise<OpenSkyTokenResult>
  openSkyFetchStates: (bounds: OpenSkyBounds, token: string | null) => Promise<OpenSkyStatesResult>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
