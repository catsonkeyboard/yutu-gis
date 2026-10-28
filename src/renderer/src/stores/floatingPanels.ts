import { useTilesPanelStore } from './tilesPanelStore'
import { useOsmPanelStore } from './osmPanelStore'
import { useAnalysisPanelStore } from './analysisPanelStore'
import { useMonitorStore } from './monitorStore'
import { useStylePanelStore } from './stylePanelStore'

/**
 * 地图上的浮动面板（瓦片下载 / OSM 提取 / 矢量分析 / 数据监控 / 符号化）共享
 * 右上角同一位置，同一时刻只允许一个打开。
 *
 * 互斥放在这里而不是 Toolbar 的 onClick 里：右键菜单（MapCanvas）与图层面板
 * 的符号化入口都会直接开面板，走 store 才能保证所有入口行为一致。
 */
export type FloatingPanelKey = 'tiles' | 'osm' | 'analysis' | 'monitor' | 'style'

const SETTERS: Record<Exclude<FloatingPanelKey, 'style'>, (open: boolean) => void> = {
  tiles: (open) => useTilesPanelStore.getState().setOpen(open),
  osm: (open) => useOsmPanelStore.getState().setOpen(open),
  analysis: (open) => useAnalysisPanelStore.getState().setOpen(open),
  monitor: (open) => useMonitorStore.getState().setPanelOpen(open)
}

/** 打开（或关闭）某个浮动面板，同时关闭其余浮动面板与符号化面板。 */
export function toggleFloatingPanel(key: Exclude<FloatingPanelKey, 'style'>, open: boolean): void {
  for (const k of Object.keys(SETTERS) as Array<Exclude<FloatingPanelKey, 'style'>>) {
    SETTERS[k](k === key ? open : false)
  }
  if (open) useStylePanelStore.getState().close()
}

/** 打开符号化面板并关闭其余浮动面板。 */
export function openStylePanel(layerId: string): void {
  for (const setOpen of Object.values(SETTERS)) setOpen(false)
  useStylePanelStore.getState().openFor(layerId)
}

/** 关闭所有浮动面板（含符号化）。 */
export function closeFloatingPanels(): void {
  for (const setOpen of Object.values(SETTERS)) setOpen(false)
  useStylePanelStore.getState().close()
}
