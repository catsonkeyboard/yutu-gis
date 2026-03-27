import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { getPythonPort } from './python'
import { loadConfig, saveConfig, type AppConfig } from './config'

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

  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', (_event, config: AppConfig) => saveConfig(config))
}
