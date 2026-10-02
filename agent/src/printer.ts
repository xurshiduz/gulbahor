import { Socket } from 'node:net'

/**
 * An address on the shop's own network. The agent sends nowhere else,
 * whatever it is told: a job can never be turned into a way out to the
 * internet. The server applies the same rule when a printer is set up
 * (`isLocalHost` in `packages/core/src/labels.ts`); the agent keeps its own
 * copy so that it runs with nothing but itself installed.
 */
export function isLocalHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (ip) {
    const [a, b, c, d] = ip.slice(1).map(Number)
    if ([a, b, c, d].some((part) => part > 255)) {
      return false
    }
    return (
      a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
    )
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(value) || /^[\d.]+$/.test(value)) {
    return false
  }
  return !value.includes('.') || /\.(local|lan|home|internal)$/.test(value)
}

/** Hands raw commands to a printer over its network port (9100 on label printers). */
export function sendToPrinter(host: string, port: number, data: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    socket.setTimeout(timeoutMs)
    socket.once('timeout', () => finish(new Error(`Printer javob bermadi (${host}:${port})`)))
    socket.once('error', (error) => finish(error))
    socket.connect(port, host, () => {
      socket.write(data, 'utf8', (error) => {
        if (error) {
          finish(error)
        } else {
          socket.end(() => finish())
        }
      })
    })
  })
}
