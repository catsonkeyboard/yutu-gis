import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { getPythonPort } from './python'
import { loadConfig, saveConfig, type AppConfig } from './config'
import { startVehicleServer, stopVehicleServer, type VehicleServerConfig } from './vehicleServer'
import {
  fetchOpenSkyToken, fetchOpenSkyStates,
  fetchAdsbfiByLocation,
  type OpenSkyBounds,
} from './opensky'

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle('app:getPythonPort', () => getPythonPort())

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const buffer = await readFile(filePath)
    return buffer
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8')
  })

  ipcMain.handle('dialog:openFile', async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showSaveDialog(win, { filters })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:openDirectory', async (_event) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', (_event, config: AppConfig) => saveConfig(config))

  ipcMain.handle('vehicle:start', (_event, config: VehicleServerConfig) => {
    startVehicleServer(win, config)
  })

  ipcMain.handle('vehicle:stop', () => {
    stopVehicleServer()
    win.webContents.send('vehicle:stopped')
  })

  // ── OpenSky Network ─────────────────────────────────────────────────────
  ipcMain.handle(
    'opensky:token',
    async (_event, clientId: string, clientSecret: string) => {
      return fetchOpenSkyToken(clientId, clientSecret)
    }
  )

  ipcMain.handle(
    'opensky:states',
    async (_event, bounds: OpenSkyBounds, token: string | null) => {
      return fetchOpenSkyStates(bounds, token)
    }
  )

  // ── adsb.fi Open Data ───────────────────────────────────────────────────
  ipcMain.handle(
    'adsbfi:byLocation',
    async (_event, lat: number, lon: number, distNm: number) => {
      return fetchAdsbfiByLocation(lat, lon, distNm)
    }
  )
}
