import { describe, expect, it } from 'vitest'

import { sha256 } from './sha256'

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

describe('sha256 worked out by hand (pages opened by a local-network address)', () => {
  it('gives the standard answers', () => {
    expect(hex(sha256(new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('agrees with the browser’s own on every length around a block edge and on a file-sized buffer', async () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 300_000]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 131 + length) & 0xff)
      const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
      expect(hex(sha256(bytes))).toBe(hex(expected))
    }
  })
})
