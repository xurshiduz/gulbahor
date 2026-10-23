import type { LabelPicture } from '@erp/core'

/**
 * The picture kept with a design to redraw it when its box is resized: no wider than `maxWidth` (a 100 mm label is
 * 800 dots), on white, so even a large photo fits in the design and is never dropped.
 */
export async function sourceForLabel(file: Blob, maxWidth = 800): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const width = Math.min(maxWidth, bitmap.width)
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  // JPEG: the printer only ever sees black and white dots made from it, and a photo stays well under the limit.
  return canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * A picture made ready for a label printer's head: as many dots across as `widthDots`, each dot black or white
 * (light and see-through parts are white), packed eight to a byte as the printer reads it, and a black-and-white
 * copy for the screen made from the very same dots. Done here so the server never handles images.
 */
export async function pictureForLabel(file: Blob, widthDots: number, threshold = 160): Promise<LabelPicture> {
  const bitmap = await createImageBitmap(file)
  const width = Math.max(8, Math.round(widthDots))
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d') as CanvasRenderingContext2D
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  const image = context.getImageData(0, 0, width, height)

  const bytes = Math.ceil(width / 8)
  let hex = ''
  for (let y = 0; y < height; y += 1) {
    for (let byte = 0; byte < bytes; byte += 1) {
      let value = 0
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byte * 8 + bit
        let dark = false
        if (x < width) {
          const at = (y * width + x) * 4
          const [r, g, b] = [image.data[at], image.data[at + 1], image.data[at + 2]]
          dark = 0.299 * r + 0.587 * g + 0.114 * b < threshold
          // The same dot on the screen's copy.
          const shade = dark ? 0 : 255
          image.data[at] = image.data[at + 1] = image.data[at + 2] = shade
          image.data[at + 3] = 255
        }
        value = (value << 1) | (dark ? 1 : 0)
      }
      hex += value.toString(16).toUpperCase().padStart(2, '0')
    }
  }
  context.putImageData(image, 0, 0)
  return { width, height, hex, preview: canvas.toDataURL('image/png') }
}
