import { describe, expect, it } from 'vitest'

import { decodePicture, fitWithin, imageUrl, productImageInputSchema, readImageSize } from './images'

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)))

/** The least a JPEG can be and still say how large it is. */
const jpeg = (width: number, height: number) =>
  bytes(
    [0xff, 0xd8],
    // An application segment first, as cameras write one.
    [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46],
    [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9],
  )

const webp = (width: number, height: number) =>
  bytes(
    'RIFF',
    [0, 0, 0, 0],
    'WEBP',
    'VP8 ',
    [0, 0, 0, 0],
    [0, 0, 0],
    [0x9d, 0x01, 0x2a],
    [width & 0xff, width >> 8, height & 0xff, height >> 8],
  )

describe('readImageSize', () => {
  it('reads a JPEG from the segment that starts its frame', () => {
    expect(readImageSize(jpeg(1600, 1067))).toEqual({ format: 'jpeg', width: 1600, height: 1067 })
  })

  it('reads a WebP whichever way it is written', () => {
    expect(readImageSize(webp(640, 427))).toEqual({ format: 'webp', width: 640, height: 427 })
    // Lossless: the sizes less one, fourteen bits each, packed.
    const packed = (160 - 1) | ((120 - 1) << 14)
    const lossless = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBP',
      'VP8L',
      [0, 0, 0, 0],
      [0x2f],
      [packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff, (packed >> 24) & 0xff],
      [0, 0, 0, 0, 0],
    )
    expect(readImageSize(lossless)).toEqual({ format: 'webp', width: 160, height: 120 })
    // Extended, as a picture with transparency is: the canvas less one, three bytes each.
    const extended = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBP',
      'VP8X',
      [10, 0, 0, 0],
      [0, 0, 0, 0],
      [0x3f, 0x06, 0],
      [0x2a, 0x04, 0],
    )
    expect(readImageSize(extended)).toEqual({ format: 'webp', width: 1600, height: 1067 })
  })

  it('takes nothing else for a picture', () => {
    expect(readImageSize(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(readImageSize(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(readImageSize(bytes([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(readImageSize(new Uint8Array())).toBeNull()
  })
})

describe('a photograph sent to be kept', () => {
  const picture = 'data:image/webp;base64,UklGRg=='

  it('is three sizes and a blur, each a WebP or a JPEG', () => {
    const input = { small: picture, medium: picture, large: picture, blur: picture }
    expect(productImageInputSchema.parse(input)).toEqual({ ...input, valueId: null })
    expect(productImageInputSchema.safeParse({ ...input, large: 'data:image/png;base64,iVBORw0KGgo=' }).success).toBe(
      false,
    )
    expect(productImageInputSchema.safeParse({ ...input, medium: undefined }).success).toBe(false)
    // A small one as heavy as a large one was not made by the screen that takes them.
    const heavy = `data:image/webp;base64,${'A'.repeat(200_000)}`
    expect(productImageInputSchema.safeParse({ ...input, small: heavy }).success).toBe(false)
    expect(productImageInputSchema.safeParse({ ...input, large: heavy }).success).toBe(true)
  })

  it('gives up its bytes and says what it claims to be', () => {
    expect(decodePicture('data:image/jpeg;base64,/9j/4A==')).toEqual({ format: 'jpeg', base64: '/9j/4A==' })
    expect(decodePicture('data:text/html;base64,PGI+')).toBeNull()
  })
})

describe('fitWithin', () => {
  it('brings the longest side down and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 160)).toEqual({ width: 120, height: 160 })
  })

  it('never makes a small picture larger', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('imageUrl', () => {
  it('is an address that never changes', () => {
    expect(imageUrl('org', 'image', 's', 'webp')).toBe('/api/files/org/image/s.webp')
    expect(imageUrl('org', 'image', 'l', 'jpeg')).toBe('/api/files/org/image/l.jpg')
  })
})
