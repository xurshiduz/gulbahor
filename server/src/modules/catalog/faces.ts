import { imageUrl, type ImageFormat, type ImageThumb, type ProductImageDto } from '@erp/core'
import type { EntityManager } from 'typeorm'

/**
 * The face of each model: the first of its photographs. For whoever lists
 * models inside a transaction of their own — the stock, a receipt.
 */
export async function productFaces(em: EntityManager, productIds: string[]): Promise<Map<string, ImageThumb>> {
  const faces = new Map<string, ImageThumb>()
  if (!productIds.length) {
    return faces
  }
  const rows: { product_id: string; org_id: string; id: string; format: ImageFormat; blur: string }[] = await em.query(
    `SELECT DISTINCT ON (product_id) product_id, org_id, id, format, blur
     FROM product_images WHERE product_id = ANY($1)
     ORDER BY product_id, sort_order, created_at`,
    [productIds],
  )
  for (const row of rows) {
    faces.set(row.product_id, { url: imageUrl(row.org_id, row.id, 's', row.format), blur: row.blur })
  }
  return faces
}

interface ImageRow {
  id: string
  orgId: string
  valueId: string | null
  format: ImageFormat
  blur: string
  width: number
  height: number
}

export function imageDto(image: ImageRow): ProductImageDto {
  return {
    id: image.id,
    valueId: image.valueId,
    small: imageUrl(image.orgId, image.id, 's', image.format),
    medium: imageUrl(image.orgId, image.id, 'm', image.format),
    large: imageUrl(image.orgId, image.id, 'l', image.format),
    blur: image.blur,
    width: image.width,
    height: image.height,
  }
}

/** Every photograph of one model, in the order they stand; for screens outside the catalogue (the stock). */
export async function productImages(em: EntityManager, productId: string): Promise<ProductImageDto[]> {
  const rows: ImageRow[] = await em.query(
    `SELECT id, org_id AS "orgId", value_id AS "valueId", format, blur, width, height
     FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at`,
    [productId],
  )
  return rows.map(imageDto)
}
