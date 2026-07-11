import { join } from 'path'
import { homedir } from 'os'
import { mkdir, readFile, writeFile } from 'fs/promises'

export interface BookmarkEntry {
  id: string
  name: string
  center: [number, number]
  zoom: number
  provider: string
  createdAt: number
}

export interface AppConfig {
  language: 'zh' | 'en'
  googleMap: { apiKey: string }
  amap: { apiKey: string }
  openWeather: { apiKey: string }
  firms: { apiKey: string }
  waqi: { apiKey: string }
  download: { dir: string }
  bookmarks: BookmarkEntry[]
}

const DEFAULT_CONFIG: AppConfig = {
  language: 'zh',
  googleMap: { apiKey: '' },
  amap: { apiKey: '' },
  openWeather: { apiKey: '' },
  firms: { apiKey: '' },
  waqi: { apiKey: '' },
  download: { dir: join(homedir(), 'Downloads') },
  bookmarks: []
}

function getConfigDir(): string {
  return join(homedir(), '.yutugis')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export async function loadConfig(): Promise<AppConfig> {
  await mkdir(getConfigDir(), { recursive: true })
  try {
    const raw = await readFile(getConfigPath(), 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    // File doesn't exist yet or is malformed — return defaults
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true })
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

/** Read-merge-write partial update — callers never clobber keys they don't know about. */
export async function updateConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  const merged = { ...current, ...partial }
  await saveConfig(merged)
  return merged
}
