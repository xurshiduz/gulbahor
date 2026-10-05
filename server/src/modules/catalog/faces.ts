import { imageUrl, type ImageFormat, type ImageThumb } from '@gulbahor/core'
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
