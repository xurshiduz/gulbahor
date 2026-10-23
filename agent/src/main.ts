#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { startAgent, VERSION } from './agent'

interface Config {
  url?: string
  key?: string
  usbPrinters?: Record<string, string>
}

/**
 * `agent.json` in the folder it is started from or beside the program (the single installed file sits beside it,
 * the built one a folder down); the environment wins over all.
 */
function readConfig(): Config {
  const file = [join(process.cwd(), 'agent.json'), join(__dirname, 'agent.json'), join(__dirname, '..', 'agent.json')].find(
    (path) => existsSync(path),
  )
  // Windows PowerShell writes a byte-order mark at the start of the file it saves; JSON will not have it.
  const fromFile = file ? (JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as Config) : {}
  return {
    url: process.env.ERP_URL ?? fromFile.url,
    key: process.env.ERP_KEY ?? fromFile.key,
    usbPrinters: fromFile.usbPrinters,
  }
}

const stamp = () => new Date().toLocaleString('sv-SE')
const log = (line: string) => console.log(`${stamp()}  ${line}`)

const config = readConfig()
if (!config.url || !config.key) {
  console.error(
    [
      "Sozlama topilmadi. Shu papkada agent.json fayli bo'lishi kerak:",
      '',
      '  { "url": "https://sizning-domen.uz", "key": "Qurilmalar sahifasida berilgan kalit" }',
      '',
      "yoki ERP_URL va ERP_KEY muhit o'zgaruvchilari.",
    ].join('\n'),
  )
  process.exit(1)
}

log(`ERP agenti ${VERSION}: ${config.url}`)
startAgent({
  url: config.url,
  key: config.key,
  usbPrinters: config.usbPrinters,
  log,
  onRefused: () => {
    log('Kalitni tekshiring: Qurilmalar sahifasida yangi kalit oling va agent.json ga yozing.')
    process.exit(2)
  },
})
