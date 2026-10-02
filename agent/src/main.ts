#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { startAgent, VERSION } from './agent'

interface Config {
  url?: string
  key?: string
}

/** `agent.json` beside the program or in the folder it is started from; the environment wins over both. */
function readConfig(): Config {
  const file = [join(process.cwd(), 'agent.json'), join(__dirname, '..', 'agent.json')].find((path) => existsSync(path))
  const fromFile = file ? (JSON.parse(readFileSync(file, 'utf8')) as Config) : {}
  return {
    url: process.env.GULBAHOR_URL ?? fromFile.url,
    key: process.env.GULBAHOR_KEY ?? fromFile.key,
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
      "yoki GULBAHOR_URL va GULBAHOR_KEY muhit o'zgaruvchilari.",
    ].join('\n'),
  )
  process.exit(1)
}

log(`Gulbahor agenti ${VERSION}: ${config.url}`)
startAgent({
  url: config.url,
  key: config.key,
  log,
  onRefused: () => {
    log('Kalitni tekshiring: Qurilmalar sahifasida yangi kalit oling va agent.json ga yozing.')
    process.exit(2)
  },
})
