import { app } from 'electron'
import { Menu, BrowserWindow, dialog } from 'electron'

export function buildMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '导入数据...',
          accelerator: 'CmdOrCtrl+I',
          click: () => win.webContents.send('menu:import'),
        },
        {
          label: '导出数据...',
          accelerator: 'CmdOrCtrl+E',
          click: () => win.webContents.send('menu:export'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 YutuGIS 舆图',
          click: () =>
            dialog.showMessageBox(win, {
              title: 'YutuGIS 舆图',
              message: 'YutuGIS 舆图 v0.1.0',
              detail: 'A professional GIS desktop application.',
            }),
        },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
