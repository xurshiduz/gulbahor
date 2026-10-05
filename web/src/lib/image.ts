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

function loaded(file: File): Promise<HTMLImageElement> {
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
