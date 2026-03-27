import { contextBridge, ipcRenderer } from 'electron'

type AppConfig = { language: 'zh' | 'en'; googleMap: { apiKey: string }; amap: { apiKey: string } }

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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
