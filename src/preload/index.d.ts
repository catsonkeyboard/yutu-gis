type AppConfig = { language: 'zh' | 'en'; googleMap: { apiKey: string }; amap: { apiKey: string } }

export interface ElectronAPI {
  getPythonPort: () => Promise<number>
  readFile: (filePath: string) => Promise<Buffer>
  writeFile: (filePath: string, content: string) => Promise<void>
  openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  saveFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  onMenuAction: (callback: (action: string) => void) => () => void
  loadConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
