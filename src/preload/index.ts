import { contextBridge, ipcRenderer } from 'electron'

type AppConfig = { language: 'zh' | 'en'; googleMap: { apiKey: string }; amap: { apiKey: string } }
type VehicleServerConfig = { host: string; port: number; protocol: 'udp' | 'tcp' }
type VehiclePacket = { time: number; devNo: string; direct: number; speed: number; lat: number; lon: number }
type OpenSkyBounds = { lamin: number; lomin: number; lamax: number; lomax: number }
type OpenSkyTokenResult = { access_token: string; expires_in: number }
type OpenSkyStatesResult = { time: number; states: unknown[][] | null }
type AdsbfiAircraft = { hex: string; flight?: string; r?: string; t?: string; alt_baro?: number | 'ground'; alt_geom?: number; gs?: number; track?: number; baro_rate?: number; squawk?: string; lat?: number; lon?: number; seen_pos?: number; seen?: number; category?: string }
type AdsbfiResponse = { ac: AdsbfiAircraft[] | null; msg: string; now: number; total: number; ctime: number; ptime: number }

const electronAPI = {
  getPythonPort: (): Promise<number> =>
    ipcRenderer.invoke('app:getPythonPort'),

  loadConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke('config:load'),

  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke('config:save', config),

  readFile: (filePath: string): Promise<Buffer> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  openFileDialog: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),

  saveFileDialog: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', filters),

  openDirectoryDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory'),

  onMenuAction: (callback: (action: string) => void): (() => void) => {
    const actions = ['menu:import', 'menu:export', 'menu:open', 'menu:save']
    const listeners = actions.map((action) => {
      const listener = (): void => callback(action.replace('menu:', ''))
      ipcRenderer.on(action, listener)
      return { action, listener }
    })
    // Return cleanup function
    return () => {
      listeners.forEach(({ action, listener }) => ipcRenderer.removeListener(action, listener))
    }
  },

  startVehicleServer: (config: VehicleServerConfig): Promise<void> =>
    ipcRenderer.invoke('vehicle:start', config),

  stopVehicleServer: (): Promise<void> =>
    ipcRenderer.invoke('vehicle:stop'),

  onVehicleData: (callback: (packet: VehiclePacket) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, packet: VehiclePacket): void => callback(packet)
    ipcRenderer.on('vehicle:data', listener)
    return () => ipcRenderer.removeListener('vehicle:data', listener)
  },

  onVehicleError: (callback: (msg: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: string): void => callback(msg)
    ipcRenderer.on('vehicle:error', listener)
    return () => ipcRenderer.removeListener('vehicle:error', listener)
  },

  onVehicleStarted: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('vehicle:started', listener)
    return () => ipcRenderer.removeListener('vehicle:started', listener)
  },

  // ── OpenSky Network ────────────────────────────────────────────────────
  openSkyFetchToken: (clientId: string, clientSecret: string): Promise<OpenSkyTokenResult> =>
    ipcRenderer.invoke('opensky:token', clientId, clientSecret),

  openSkyFetchStates: (bounds: OpenSkyBounds, token: string | null): Promise<OpenSkyStatesResult> =>
    ipcRenderer.invoke('opensky:states', bounds, token),

  // ── adsb.fi Open Data ──────────────────────────────────────────────────
  adsbfiFetchByLocation: (lat: number, lon: number, distNm: number): Promise<AdsbfiResponse> =>
    ipcRenderer.invoke('adsbfi:byLocation', lat, lon, distNm),

  onVehicleStopped: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('vehicle:stopped', listener)
    return () => ipcRenderer.removeListener('vehicle:stopped', listener)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
