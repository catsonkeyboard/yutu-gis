import { contextBridge, ipcRenderer } from 'electron'

type BookmarkEntry = {
  id: string
  name: string
  center: [number, number]
  zoom: number
  provider: string
  createdAt: number
}
type AppConfig = {
  language: 'zh' | 'en'
  googleMap: { apiKey: string }
  amap: { apiKey: string }
  download: { dir: string }
  bookmarks?: BookmarkEntry[]
}
type VehicleServerConfig = { host: string; port: number; protocol: 'udp' | 'tcp' }
type VehiclePacket = {
  time: number
  devNo: string
  direct: number
  speed: number
  lat: number
  lon: number
}
const electronAPI = {
  getPythonPort: (): Promise<number> => ipcRenderer.invoke('app:getPythonPort'),

  loadConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),

  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),

  updateConfig: (partial: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:update', partial),

  readFile: (filePath: string): Promise<Buffer> => ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  writeFileBinary: (filePath: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('fs:writeFileBinary', filePath, data),

  openFileDialog: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),

  saveFileDialog: (
    filters: { name: string; extensions: string[] }[],
    defaultPath?: string
  ): Promise<string | null> => ipcRenderer.invoke('dialog:saveFile', filters, defaultPath),

  openDirectoryDialog: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openDirectory', defaultPath),

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

  stopVehicleServer: (): Promise<void> => ipcRenderer.invoke('vehicle:stop'),

  onVehicleData: (callback: (packet: VehiclePacket) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, packet: VehiclePacket): void =>
      callback(packet)
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

  onVehicleStopped: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('vehicle:stopped', listener)
    return () => ipcRenderer.removeListener('vehicle:stopped', listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
