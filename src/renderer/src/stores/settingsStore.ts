import { create } from 'zustand'

interface ApiKeys {
  google: string
  amap: string
  openweather: string
  firms: string
  waqi: string
}

interface SettingsState {
  language: 'zh' | 'en'
  apiKeys: ApiKeys
  downloadDir: string
  setLanguage: (lang: 'zh' | 'en') => void
  setApiKeys: (keys: Partial<ApiKeys>) => void
  setDownloadDir: (dir: string) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'zh',
  apiKeys: { google: '', amap: '', openweather: '', firms: '', waqi: '' },
  downloadDir: '',
  setLanguage: (language) => set({ language }),
  setApiKeys: (keys) => set((s) => ({ apiKeys: { ...s.apiKeys, ...keys } })),
  setDownloadDir: (downloadDir) => set({ downloadDir }),
}))
