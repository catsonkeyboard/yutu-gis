import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import net from 'net'
import { is } from '@electron-toolkit/utils'

let pythonProcess: ChildProcess | null = null
let pythonPort = 0

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
  })
}

function getProjectRoot(): string {
  if (is.dev) {
    // In dev mode, __dirname is out/main/, so go up two levels to project root
    return path.join(__dirname, '..', '..')
  }
  return process.resourcesPath
}

export async function startPython(): Promise<number> {
  pythonPort = await findFreePort()

  let pythonExe: string
  let args: string[]

  if (is.dev) {
    const projectRoot = getProjectRoot()
    // Try python3 first, then python
    const venvPython = path.join(projectRoot, 'python', '.venv', 'bin', 'python3.12')
    pythonExe = venvPython
    const scriptPath = path.join(projectRoot, 'python', 'main.py')
    args = [scriptPath, String(pythonPort)]

    console.log('[Python] Project root:', projectRoot)
    console.log('[Python] Python exe:', pythonExe)
    console.log('[Python] Script:', scriptPath)
  } else {
    pythonExe = path.join(process.resourcesPath, 'python-backend')
    args = [String(pythonPort)]
  }

  const env: NodeJS.ProcessEnv = { ...process.env }
  if (is.dev) {
    const projectRoot = getProjectRoot()
    env['PYTHONPATH'] = path.join(projectRoot, 'python')
  }

  pythonProcess = spawn(pythonExe, args, { stdio: 'pipe', env })

  pythonProcess.stdout?.on('data', (d: Buffer) => console.log('[Python]', d.toString().trim()))
  pythonProcess.stderr?.on('data', (d: Buffer) => console.error('[Python]', d.toString().trim()))
  pythonProcess.on('error', (err) => console.error('[Python] Failed to start:', err.message))

  // Wait for server to be ready
  await waitForServer(pythonPort, 10000)
  return pythonPort
}

async function waitForServer(port: number, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`)
      if (resp.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Python server did not start within ${timeout}ms`)
}

export function stopPython(): void {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

export function getPythonPort(): number {
  return pythonPort
}
