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
  openWeather: { apiKey: string }
  firms: { apiKey: string }
  waqi: { apiKey: string }
  download: { dir: string }
  bookmarks: BookmarkEntry[]
  recentProjects: string[]
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

export interface ElectronAPI {
  getPythonPort: () => Promise<number>
  readFile: (filePath: string) => Promise<Buffer>
  writeFile: (filePath: string, content: string) => Promise<void>
  writeFileBinary: (filePath: string, data: ArrayBuffer) => Promise<void>
  openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  saveFileDialog: (
    filters: { name: string; extensions: string[] }[],
    defaultPath?: string
  ) => Promise<string | null>
  openDirectoryDialog: (defaultPath?: string) => Promise<string | null>
  onMenuAction: (callback: (action: string) => void) => () => void
  loadConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  updateConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
  // Vehicle tracking
  startVehicleServer: (config: VehicleServerConfig) => Promise<void>
  stopVehicleServer: () => Promise<void>
  onVehicleData: (callback: (packet: VehiclePacket) => void) => () => void
  onVehicleError: (callback: (msg: string) => void) => () => void
  onVehicleStarted: (callback: () => void) => () => void
  onVehicleStopped: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
