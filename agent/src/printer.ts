import { spawn } from 'node:child_process'
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

const RAW_PRINT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DocInfo { public string Name; public string Output; public string Type; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern int StartDocPrinter(IntPtr handle, int level, DocInfo info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static void Send(string name, byte[] bytes) {
    IntPtr handle;
    if (!OpenPrinter(name, out handle, IntPtr.Zero)) throw new Exception("Printer topilmadi: " + name);
    try {
      if (StartDocPrinter(handle, 1, new DocInfo { Name = "ERP", Type = "RAW" }) == 0) throw new Exception("Chop etish boshlanmadi");
      StartPagePrinter(handle);
      int written;
      bool ok = WritePrinter(handle, bytes, bytes.Length, out written);
      EndPagePrinter(handle);
      EndDocPrinter(handle);
      if (!ok || written != bytes.Length) throw new Exception("Printerga yozilmadi");
    } finally { ClosePrinter(handle); }
  }
}
'@
[RawPrinter]::Send($env:ERP_PRINTER, [Convert]::FromBase64String([Console]::In.ReadToEnd()))
`

/** Hands raw commands to a Windows print queue, for a printer plugged in by USB. */
export function sendToWindowsPrinter(queue: string, data: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', RAW_PRINT], {
      env: { ...process.env, ERP_PRINTER: queue },
      windowsHide: true,
    })
    let errors = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Printer javob bermadi (${queue})`))
    }, timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
      } else {
        const reason = /Exception[^:]*:\s*"?([^"\r\n]+)/.exec(errors)?.[1] ?? errors.trim().split(/\r?\n/)[0]
        reject(new Error(reason || `powershell ${code}`))
      }
    })
    child.stdin.end(Buffer.from(data, 'utf8').toString('base64'))
  })
}
