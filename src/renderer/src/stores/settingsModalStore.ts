import { create } from 'zustand'

/**
 * Settings modal open state.
 *
 * Lives in a store (not App-level useState) so deeply-nested components
 * (e.g. MonitorPanel inside MapCanvas) can open Settings without a prop
 * chain through Toolbar.
 */
interface SettingsModalState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  open: false,
  setOpen: (open) => set({ open })
}))
