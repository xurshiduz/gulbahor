import { describe, expect, it } from 'vitest'

import { AGENT_FILE, agentInstaller } from './agent-installer'

describe('the agent setup file', () => {
  const file = agentInstaller('https://savdo.example.uz/', 'a1b2c3')

  it('is a Windows command file that hands the rest of itself to PowerShell', () => {
    expect(file.startsWith('@echo off\r\n')).toBe(true)
    expect(file).not.toMatch(/[^\r]\n/)
    const lines = file.split('\r\n')
    // The marker stands once on a line of its own; the command line only builds it.
    expect(lines.filter((line) => line === '#SAVDO#')).toHaveLength(1)
    expect(lines.find((line) => line.startsWith('powershell'))).not.toContain('#SAVDO#')
  })

  it('carries the address and the key, and takes the agent from that address', () => {
    expect(file).toContain("$url = 'https://savdo.example.uz'")
    expect(file).toContain("$key = 'a1b2c3'")
    expect(file).toContain(`'${AGENT_FILE}'`)
  })

  it('cannot be broken out of by a quote', () => {
    expect(agentInstaller('https://x.uz', "it's")).toContain("$key = 'it''s'")
  })

  it('keeps ‘ and ’ out of single quotes, where PowerShell would end the text at them', () => {
    const script = file.slice(file.indexOf('#SAVDO#'))
    for (const text of script.match(/'[^'\r\n]*'/g) ?? []) {
      expect(text).not.toMatch(/[‘’]/)
    }
  })
})
