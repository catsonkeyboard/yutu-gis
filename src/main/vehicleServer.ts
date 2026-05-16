/**
 * vehicleClient.ts
 *
 * Acts as a CLIENT that connects to an external vehicle-tracking server
 * and forwards received packets to the renderer via IPC push.
 *
 * - TCP mode : establish a persistent TCP connection to host:port,
 *              read newline-delimited JSON stream.
 * - UDP mode : bind a local port to receive UDP datagrams broadcast/unicast
 *              by the remote server (UDP is connectionless; the server pushes
 *              packets to our listening port).
 */

import * as dgram from 'dgram'
import * as net from 'net'
import { BrowserWindow } from 'electron'

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

// ── State ────────────────────────────────────────────────────────────────────

let udpSocket: dgram.Socket | null = null
let tcpSocket: net.Socket | null = null
let currentWin: BrowserWindow | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stopped = false // set true when user explicitly disconnects

const RECONNECT_DELAY_MS = 3000

// ── Helpers ──────────────────────────────────────────────────────────────────

function push(packet: VehiclePacket): void {
  if (!currentWin || currentWin.isDestroyed()) return
  currentWin.webContents.send('vehicle:data', packet)
}

function parseAndPush(raw: string): void {
  const segments = raw.split('\n')
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue
    try {
      const packet = JSON.parse(trimmed) as Partial<VehiclePacket>
      if (
        typeof packet.devNo === 'string' &&
        typeof packet.lat === 'number' &&
        typeof packet.lon === 'number'
      ) {
        push(packet as VehiclePacket)
      }
    } catch {
      // skip malformed JSON
    }
  }
}

function sendError(msg: string): void {
  if (!currentWin || currentWin.isDestroyed()) return
  currentWin.webContents.send('vehicle:error', msg)
}

// ── UDP receive ───────────────────────────────────────────────────────────────
// The remote server sends UDP datagrams to our bound port.
// We bind 0.0.0.0:<port> so the OS delivers any datagram arriving on that port.

function startUdp(win: BrowserWindow, config: VehicleServerConfig): void {
  const sock = dgram.createSocket('udp4')

  sock.on('message', (msg) => {
    parseAndPush(msg.toString('utf-8'))
  })

  sock.on('error', (err) => {
    sendError(err.message)
    sock.close()
    udpSocket = null
    if (!stopped) scheduleReconnect(win, config)
  })

  // Bind on all interfaces so we receive unicast, broadcast, and multicast
  sock.bind(config.port, '0.0.0.0', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('vehicle:started', config)
    }
  })

  udpSocket = sock
}

// ── TCP client ────────────────────────────────────────────────────────────────

function startTcp(win: BrowserWindow, config: VehicleServerConfig): void {
  let buffer = ''

  const sock = net.createConnection({ host: config.host, port: config.port }, () => {
    if (!win.isDestroyed()) {
      win.webContents.send('vehicle:started', config)
    }
  })

  sock.setKeepAlive(true, 5000)

  sock.on('data', (chunk) => {
    buffer += chunk.toString('utf-8')
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? '' // keep the last incomplete fragment
    for (const part of parts) {
      parseAndPush(part)
    }
  })

  sock.on('error', (err) => {
    sendError(err.message)
  })

  sock.on('close', () => {
    tcpSocket = null
    if (!stopped) scheduleReconnect(win, config)
  })

  tcpSocket = sock
}

// ── Reconnect ─────────────────────────────────────────────────────────────────

function scheduleReconnect(win: BrowserWindow, config: VehicleServerConfig): void {
  if (stopped) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (stopped) return
    if (config.protocol === 'udp') {
      startUdp(win, config)
    } else {
      startTcp(win, config)
    }
  }, RECONNECT_DELAY_MS)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startVehicleServer(win: BrowserWindow, config: VehicleServerConfig): void {
  stopVehicleServer()
  stopped = false
  currentWin = win

  if (config.protocol === 'udp') {
    startUdp(win, config)
  } else {
    startTcp(win, config)
  }
}

export function stopVehicleServer(): void {
  stopped = true

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  if (udpSocket) {
    try {
      udpSocket.close()
    } catch {
      /* ignore */
    }
    udpSocket = null
  }

  if (tcpSocket) {
    try {
      tcpSocket.destroy()
    } catch {
      /* ignore */
    }
    tcpSocket = null
  }

  currentWin = null
}
