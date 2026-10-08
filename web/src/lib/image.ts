import { fitWithin, IMAGE_SIZES } from '@erp/core'

/**
 * A picture chosen from the computer, made small enough to keep with a
 * receipt's template: no wider than a receipt prints, on white, as a data
 * URL. Rejects when what was chosen is no picture, or stays too large.
 */
export async function pictureForPaper(file: File, maxWidth: number, maxLength: number): Promise<string> {
  const image = await loaded(file)
  const scale = Math.min(1, maxWidth / image.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('no canvas')
  }
  // Paper is white: a logo cut out of its background would print on black otherwise.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const sharp = canvas.toDataURL('image/png')
  if (sharp.length <= maxLength) {
    return sharp
  }
  const packed = canvas.toDataURL('image/jpeg', 0.85)
  if (packed.length <= maxLength) {
    return packed
  }
  throw new Error('too large')
}

export interface PhotoVersions {
  small: string
  medium: string
  large: string
  blur: string
}

/** How long the longest side of the stand-in is: enough to say what colours lie where. */
const BLUR_SIDE = 16

/**
 * A photograph made ready to be kept: three sizes and a blur, each drawn
 * down from the one before it. A phone's eight megabytes leave this as a few
 * hundred kilobytes, so nothing heavy travels and the server has nothing to
 * redraw. WebP where the browser can write it, JPEG where it cannot.
 */
export async function photoVersions(file: Blob): Promise<PhotoVersions> {
  const image = await loaded(file)
  let source: CanvasImageSource = image
  let width = image.naturalWidth
  let height = image.naturalHeight
  const down = (longest: number): HTMLCanvasElement => {
    const size = fitWithin(width, height, longest)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('no canvas')
    }
    // A photograph cut out of its background stands on white, as it would on a page.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size.width, size.height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, size.width, size.height)
    source = canvas
    width = size.width
    height = size.height
    return canvas
  }
  const large = down(IMAGE_SIZES.l)
  const medium = down(IMAGE_SIZES.m)
  const small = down(IMAGE_SIZES.s)
  const blur = down(BLUR_SIDE)

  // A browser that cannot write WebP answers with a PNG instead of saying so.
  const type = small.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'
  return {
    large: large.toDataURL(type, 0.82),
    medium: medium.toDataURL(type, 0.8),
    small: small.toDataURL(type, 0.78),
    blur: blur.toDataURL(type, 0.5),
  }
}

function loaded(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not a picture'))
    }
    image.src = url
  })
}
