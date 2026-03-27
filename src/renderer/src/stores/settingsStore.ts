import { create } from 'zustand'

interface ApiKeys {
  google: string
  amap: string
}

interface SettingsState {
  language: 'zh' | 'en'
  apiKeys: ApiKeys
  setLanguage: (lang: 'zh' | 'en') => void
  setApiKeys: (keys: Partial<ApiKeys>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: 'zh',
  apiKeys: { google: '', amap: '' },
  setLanguage: (language) => set({ language }),
  setApiKeys: (keys) => set((s) => ({ apiKeys: { ...s.apiKeys, ...keys } })),
}))
