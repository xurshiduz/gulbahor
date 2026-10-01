import { searchKey } from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

interface IndexRow {
  product_id: string
  name: string
  sku: string
  material: string | null
  brand: string | null
  variant_id: string
  variant_sku: string
  value_names: string[]
  barcodes: string[]
}

/**
 * Rebuilds what models and their variants are found by. A model answers to
 * its name, article, brand, material, and to every colour, size, article and
 * barcode of its variants; a variant to the model's words plus its own.
 * Call it after anything that changes those words, including a renamed brand
 * or attribute value.
 */
export async function reindexProducts(em: EntityManager, productIds: string[]): Promise<void> {
  if (!productIds.length) {
    return
  }
  const rows: IndexRow[] = await em.query(
    `SELECT p.id AS product_id, p.name, p.sku, p.material, b.name AS brand,
            v.id AS variant_id, v.sku AS variant_sku,
            array_remove(ARRAY[a1.name, a2.name, a3.name], NULL) AS value_names,
            coalesce((SELECT array_agg(c.code) FROM variant_barcodes c WHERE c.variant_id = v.id), '{}') AS barcodes
     FROM products p
     JOIN product_variants v ON v.product_id = p.id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN attribute_values a1 ON a1.id = v.value1_id
     LEFT JOIN attribute_values a2 ON a2.id = v.value2_id
     LEFT JOIN attribute_values a3 ON a3.id = v.value3_id
     WHERE p.id = ANY($1)`,
    [productIds],
  )

  const productWords = new Map<string, Set<string>>()
  const variantIds: string[] = []
  const variantKeys: string[] = []

  for (const row of rows) {
    const own = [row.name, row.sku, row.brand ?? '', row.material ?? '']
    let words = productWords.get(row.product_id)
    if (!words) {
      words = new Set(own)
      productWords.set(row.product_id, words)
    }
    const variantWords = [...row.value_names, row.variant_sku, ...row.barcodes]
    variantWords.forEach((word) => words.add(word))

    variantIds.push(row.variant_id)
    variantKeys.push(searchKey([...own, ...variantWords].join(' ')))
  }

  await em.query(
    `UPDATE product_variants v SET search_key = d.key
     FROM unnest($1::uuid[], $2::text[]) AS d (id, key)
     WHERE v.id = d.id AND v.search_key IS DISTINCT FROM d.key`,
    [variantIds, variantKeys],
  )
  await em.query(
    `UPDATE products p SET search_key = d.key
     FROM unnest($1::uuid[], $2::text[]) AS d (id, key)
     WHERE p.id = d.id AND p.search_key IS DISTINCT FROM d.key`,
    [[...productWords.keys()], [...productWords.values()].map((words) => searchKey([...words].join(' ')))],
  )
}

/** Reindexes every model matched by a `WHERE` clause over `products p`. `where` is trusted SQL. */
export async function reindexProductsWhere(em: EntityManager, where: string, params: unknown[]): Promise<void> {
  const rows: { id: string }[] = await em.query(`SELECT p.id FROM products p WHERE ${where}`, params)
  await reindexProducts(
    em,
    rows.map((row) => row.id),
  )
}
