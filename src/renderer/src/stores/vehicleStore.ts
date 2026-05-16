import { create } from 'zustand'

export interface VehiclePacket {
  time: number
  devNo: string
  direct: number
  speed: number
  lat: number
  lon: number
}

export interface VehicleServerConfig {
  host: string
  port: number
  protocol: 'udp' | 'tcp'
}

interface VehicleState {
  /** Whether the client is currently connected */
  connected: boolean
  /** Last saved connection config */
  config: VehicleServerConfig
  /** Latest position packet keyed by devNo */
  devices: Record<string, VehiclePacket>

  setConnected: (v: boolean) => void
  setConfig: (config: VehicleServerConfig) => void
  updateDevice: (packet: VehiclePacket) => void
  clear: () => void
}

export const useVehicleStore = create<VehicleState>((set) => ({
  connected: false,
  config: { host: '127.0.0.1', port: 5000, protocol: 'udp' },
  devices: {},

  setConnected: (connected) => set({ connected }),

  setConfig: (config) => set({ config }),

  updateDevice: (packet) =>
    set((s) => ({
      devices: { ...s.devices, [packet.devNo]: packet },
    })),

  clear: () => set({ devices: {}, connected: false }),
}))
