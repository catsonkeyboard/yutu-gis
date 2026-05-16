import { join } from 'path'
import { homedir } from 'os'
import { mkdir, readFile, writeFile } from 'fs/promises'

export interface AppConfig {
  language: 'zh' | 'en'
  googleMap: { apiKey: string }
  amap: { apiKey: string }
}

const DEFAULT_CONFIG: AppConfig = {
  language: 'zh',
  googleMap: { apiKey: '' },
  amap: { apiKey: '' }
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
