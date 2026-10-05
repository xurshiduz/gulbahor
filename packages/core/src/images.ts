import { z } from 'zod'

import { idSchema } from './schemas'

/**
 * A product's photographs. Several to a model, the first of them its face:
 * the one a list and the till show. A photograph may belong to one colour,
 * and is then what a piece of that colour is shown by.
 *
 * The screen that takes a photograph makes it ready itself — three sizes and
 * a blur a few hundred bytes long to stand in its place while it loads — so
 * that a phone's eight megabytes never travel. The server checks what it is
 * given and keeps it; it does not redraw it.
 */

export const MAX_PRODUCT_IMAGES = 10

/** The longest side of each size, in pixels: a row of a list, the product's card, a close look. */
export const IMAGE_SIZES = { s: 160, m: 640, l: 1600 } as const
export type ImageSize = keyof typeof IMAGE_SIZES
export const IMAGE_SIZE_KEYS = Object.keys(IMAGE_SIZES) as ImageSize[]

export const IMAGE_FORMATS = ['webp', 'jpeg'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

/** No size may weigh more than this: several times what an honest screen sends. */
export const IMAGE_MAX_BYTES: Record<ImageSize, number> = { s: 60_000, m: 400_000, l: 1_500_000 }
const BLUR_MAX_LENGTH = 2_000

const PICTURE = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/

/** A picture as a data URL, no heavier than `bytes` once decoded. */
const picture = (bytes: number) =>
  z
    .string()
    .max(Math.ceil((bytes * 4) / 3) + 64, 'Rasm juda katta')
    .regex(PICTURE, 'Rasm WebP yoki JPEG bo‘lishi kerak')

export const productImageInputSchema = z.object({
  small: picture(IMAGE_MAX_BYTES.s),
  medium: picture(IMAGE_MAX_BYTES.m),
  large: picture(IMAGE_MAX_BYTES.l),
  blur: z.string().max(BLUR_MAX_LENGTH, 'Rasm juda katta').regex(PICTURE, 'Rasm WebP yoki JPEG bo‘lishi kerak'),
  /** The colour (or another value of the model) the photograph shows; none for all of them. */
  valueId: idSchema.nullish().transform((value) => value ?? null),
})
export type ProductImageInput = z.infer<typeof productImageInputSchema>

export const productImageUpdateSchema = z.object({ valueId: idSchema.nullable() })
export type ProductImageUpdate = z.infer<typeof productImageUpdateSchema>

/** Every photograph of the model, in the order they are to stand. */
export const productImageOrderSchema = z.object({ ids: z.array(idSchema).min(1).max(MAX_PRODUCT_IMAGES) })
export type ProductImageOrder = z.infer<typeof productImageOrderSchema>

export interface ProductImageDto {
  id: string
  valueId: string | null
  small: string
  medium: string
  large: string
  /** A data URL a few hundred bytes long. */
  blur: string
  width: number
  height: number
}

/** A photograph where there is room for a small one: a row of a list, a line of a receipt. */
export interface ImageThumb {
  url: string
  blur: string
}

/** Where a photograph is fetched from. The address never changes and the file behind it never does. */
export const imageUrl = (orgId: string, imageId: string, size: ImageSize, format: ImageFormat): string =>
  `/api/files/${orgId}/${imageId}/${size}.${format === 'jpeg' ? 'jpg' : 'webp'}`

/** The bytes of a picture sent as a data URL, and the format it says it is. */
export function decodePicture(dataUrl: string): { format: ImageFormat; base64: string } | null {
  const match = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl)
  return match ? { format: match[1] as ImageFormat, base64: match[2] } : null
}

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))
const le16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8)
const le24 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
const be16 = (bytes: Uint8Array, at: number) => (bytes[at] << 8) | bytes[at + 1]

/**
 * What a file is and how large its picture, read from its head alone. Null
 * for anything that is not a WebP or a JPEG: a name and a declared type prove
 * nothing.
 */
export function readImageSize(bytes: Uint8Array): { format: ImageFormat; width: number; height: number } | null {
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { format: 'webp', width: le16(bytes, 26) & 0x3fff, height: le16(bytes, 28) & 0x3fff }
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') {
      return { format: 'webp', width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 }
    }
    return null
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // A JPEG is a row of segments; the one that starts a frame says how large the picture is.
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) {
        return null
      }
      const marker = bytes[at + 1]
      if (marker === 0xff) {
        at += 1
        continue
      }
      const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (frame) {
        return { format: 'jpeg', width: be16(bytes, at + 7), height: be16(bytes, at + 5) }
      }
      at += 2 + be16(bytes, at + 2)
    }
  }
  return null
}

/** The size a picture is brought down to so that its longest side is no more than `longest`; never up. */
export function fitWithin(width: number, height: number, longest: number): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
