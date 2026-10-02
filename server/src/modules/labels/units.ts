import { EPC_PREFIX } from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

/**
 * Tagged pieces as a receipt sees them. These are plain functions over a
 * transaction, so the receipts module can keep the pieces in step with a
 * document without depending on the labels module.
 */

/** A line of whole pieces has that many labels; one measured in metres or kilos has a single one. */
const UNITS = `CASE WHEN l.qty = trunc(l.qty) THEN l.qty::int ELSE 1 END`

/** A new code: our prefix and the next number of the one sequence every business draws from. */
export const NEXT_EPC = `'${EPC_PREFIX}' || lpad(upper(to_hex(nextval('rfid_epc_serial'))), ${24 - EPC_PREFIX.length}, '0')`

/** How many pieces a receipt has of each of its variants. */
export async function receiptUnitCounts(em: EntityManager, receiptId: string): Promise<Map<string, number>> {
  const rows: { variant_id: string; units: number }[] = await em.query(
    `SELECT l.variant_id, sum(${UNITS})::int AS units FROM receipt_lines l WHERE l.receipt_id = $1 GROUP BY l.variant_id`,
    [receiptId],
  )
  return new Map(rows.map((row) => [row.variant_id, row.units]))
}

/**
 * Brings the pieces of a posted receipt in line with it: each is on hand
 * where the receipt put the goods and belongs to the batch of its line. A
 * variant on two lines gives its first pieces to the first line. Labels made
 * for pieces the receipt no longer has are void.
 */
export async function settleReceiptUnits(em: EntityManager, receiptId: string, locationId: string): Promise<void> {
  await em.query(
    `WITH spans AS (
       SELECT l.variant_id, b.id AS batch_id,
              sum(${UNITS}) OVER w - ${UNITS} AS before, sum(${UNITS}) OVER w AS upto
       FROM receipt_lines l JOIN stock_batches b ON b.receipt_line_id = l.id
       WHERE l.receipt_id = $1
       WINDOW w AS (PARTITION BY l.variant_id ORDER BY l.position)
     )
     UPDATE rfid_units u SET batch_id = s.batch_id, status = 'in_stock', location_id = $2
     FROM spans s
     WHERE u.receipt_id = $1 AND u.status = 'ready' AND u.variant_id = s.variant_id
       AND u.unit_no > s.before AND u.unit_no <= s.upto`,
    [receiptId, locationId],
  )
  await em.query(`UPDATE rfid_units SET status = 'void' WHERE receipt_id = $1 AND status = 'ready'`, [receiptId])
}

/** The receipt is cancelled or deleted: its labels stand for nothing. */
export async function voidReceiptUnits(em: EntityManager, receiptId: string): Promise<void> {
  await em.query(`UPDATE rfid_units SET status = 'void' WHERE receipt_id = $1 AND status <> 'void'`, [receiptId])
}
