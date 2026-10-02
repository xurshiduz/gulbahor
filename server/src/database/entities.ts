import type {
  AccountKind,
  AnyCurrency,
  AttributeKind,
  CurrencyCode,
  ExpenseBasis,
  Gender,
  LabelSizeKey,
  LocationKind,
  MarkupBase,
  OrgSettings,
  PaymentMethod,
  TenderMethod,
  PriceKind,
  PrinterDpi,
  PrintJobStatus,
  ReceiptStatus,
  SaleStatus,
  Season,
  ShiftStatus,
  StockDocKind,
  StockDocStatus,
  SystemAccount,
  Unit,
  UnitStatus,
  WriteoffReason,
} from '@gulbahor/core'
import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Tables are created by migrations, never by these classes: the classes only
 * describe the rows so repositories and query builders can be typed.
 */

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('text')
  name: string

  @Column('text')
  timezone: string

  @Column('text')
  baseCurrency: 'UZS' | 'USD'

  @Column('text', { array: true })
  modules: string[]

  @Column('jsonb')
  settings: Partial<OrgSettings>

  @Column('boolean')
  setupCompleted: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid', { nullable: true })
  parentId: string | null

  /**
   * One row per business has a kind outside this list, `transit`: the place goods are in while on the way
   * between two others. Nobody picks it and no screen about places shows it; see `StockService.transit`.
   */
  @Column('text')
  kind: LocationKind

  @Column('text')
  name: string

  @Column('text')
  code: string

  @Column('text', { nullable: true })
  address: string | null

  @Column('text', { nullable: true })
  phone: string | null

  @Column('boolean')
  isActive: boolean

  @Column('text')
  searchKey: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('text', { nullable: true })
  description: string | null

  @Column('text', { nullable: true })
  templateKey: string | null

  @Column('text', { array: true })
  permissions: string[]

  @Column('boolean')
  isSystem: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  fullName: string

  @Column('text')
  login: string

  @Column('text', { nullable: true })
  phone: string | null

  @Column('text')
  passwordHash: string

  @Column('text', { nullable: true })
  pinHash: string | null

  @Column('int')
  pinFailures: number

  @Column('text')
  language: 'uz' | 'ru'

  @Column('boolean')
  isActive: boolean

  @Column('boolean')
  allLocations: boolean

  @Column('boolean')
  mustChangePassword: boolean

  @Column('timestamptz', { nullable: true })
  lastLoginAt: Date | null

  @Column('text')
  searchKey: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  userId: string

  @Column('text')
  refreshHash: string

  @Column('text', { nullable: true })
  prevRefreshHash: string | null

  @Column('timestamptz', { nullable: true })
  rotatedAt: Date | null

  @Column('text')
  device: string

  @Column('text', { nullable: true })
  userAgent: string | null

  @Column('text', { nullable: true })
  ip: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @Column('timestamptz')
  lastUsedAt: Date

  @Column('timestamptz')
  expiresAt: Date

  @Column('timestamptz', { nullable: true })
  revokedAt: Date | null

  @Column('text', { nullable: true })
  revokedReason: string | null
}

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid', { nullable: true })
  actorId: string | null

  @Column('text', { nullable: true })
  actorName: string | null

  @Column('text')
  action: string

  @Column('text', { nullable: true })
  entity: string | null

  @Column('text', { nullable: true })
  entityId: string | null

  @Column('text', { nullable: true })
  summary: string | null

  /** `{ field: [before, after] }` */
  @Column('jsonb', { nullable: true })
  changes: object | null

  @Column('text', { nullable: true })
  ip: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

/** `bigint` columns hold money in minor units, always well inside what a JS number holds exactly. */
const bigintAsNumber = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
}

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid', { nullable: true })
  parentId: string | null

  @Column('text')
  name: string

  @Column('uuid', { array: true, nullable: true })
  axisIds: string[] | null

  @Column('int')
  sortOrder: number

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('attributes')
export class Attribute {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('text')
  kind: AttributeKind

  @Column('int')
  sortOrder: number

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('attribute_values')
export class AttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  attributeId: string

  @Column('text')
  name: string

  @Column('text', { nullable: true })
  hex: string | null

  @Column('int')
  sortOrder: number

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('price_types')
export class PriceType {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('text')
  kind: PriceKind

  @Column('text')
  currency: CurrencyCode

  @Column('bigint', { transformer: bigintAsNumber })
  roundStep: number

  @Column('bigint', { transformer: bigintAsNumber })
  roundEnding: number

  @Column('int')
  sortOrder: number

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  sku: string

  @Column('text')
  name: string

  @Column('uuid', { nullable: true })
  categoryId: string | null

  @Column('uuid', { nullable: true })
  brandId: string | null

  @Column('text', { nullable: true })
  gender: Gender | null

  @Column('text', { nullable: true })
  season: Season | null

  @Column('int', { nullable: true })
  collectionYear: number | null

  @Column('text', { nullable: true })
  material: string | null

  @Column('text', { nullable: true })
  originCountry: string | null

  @Column('text')
  unit: Unit

  @Column('int', { nullable: true })
  weightG: number | null

  @Column('text', { nullable: true })
  mxikCode: string | null

  @Column('text', { nullable: true })
  description: string | null

  @Column('text', { nullable: true })
  factoryCode: string | null

  @Column('text', { nullable: true })
  manufacturer: string | null

  @Column('uuid', { nullable: true })
  axis1Id: string | null

  @Column('uuid', { nullable: true })
  axis2Id: string | null

  @Column('uuid', { nullable: true })
  axis3Id: string | null

  @Column('int')
  variantSeq: number

  @Column('boolean')
  isActive: boolean

  @Column('text')
  searchKey: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  productId: string

  @Column('uuid', { nullable: true })
  value1Id: string | null

  @Column('uuid', { nullable: true })
  value2Id: string | null

  @Column('uuid', { nullable: true })
  value3Id: string | null

  @Column('text')
  sku: string

  @Column('boolean')
  isActive: boolean

  @Column('text')
  searchKey: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('variant_barcodes')
export class VariantBarcode {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  variantId: string

  @Column('text')
  code: string

  @Column('int')
  sortOrder: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('prices')
export class Price {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  priceTypeId: string

  @Column('uuid')
  productId: string

  @Column('uuid', { nullable: true })
  variantId: string | null

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('bigint', { transformer: bigintAsNumber })
  amount: number

  @Column('text')
  currency: CurrencyCode

  @Column('uuid', { nullable: true })
  updatedBy: string | null

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

/** `numeric` columns come back as text; quantities and rates are small enough to be numbers. */
const numericAsNumber = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
}

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('text', { nullable: true })
  phone: string | null

  @Column('boolean')
  isSupplier: boolean

  @Column('boolean')
  isBuyer: boolean

  @Column('text', { nullable: true })
  note: string | null

  @Column('boolean')
  isActive: boolean

  @Column('text')
  searchKey: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  number: string

  @Column('text')
  status: ReceiptStatus

  @Column('uuid')
  locationId: string

  @Column('uuid', { nullable: true })
  supplierId: string | null

  /** "2026-10-01" */
  @Column('date')
  docDate: string

  @Column('text')
  currency: AnyCurrency

  @Column('numeric', { transformer: numericAsNumber })
  usdRate: number

  @Column('numeric', { transformer: numericAsNumber })
  uzsRate: number

  @Column('text')
  extraCurrency: AnyCurrency

  @Column('text', { nullable: true })
  note: string | null

  @Column('text', { nullable: true })
  sourceFile: string | null

  @Column('text', { nullable: true })
  sourceHash: string | null

  @Column('numeric', { transformer: numericAsNumber })
  totalQty: number

  @Column('bigint', { transformer: bigintAsNumber })
  goods: number

  @Column('bigint', { transformer: bigintAsNumber })
  goodsUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  goodsUzs: number

  @Column('bigint', { transformer: bigintAsNumber })
  expensesUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  expensesUzs: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  @Column('boolean')
  hasEstimates: boolean

  @Column('text')
  searchKey: string

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @Column('text', { nullable: true })
  createdByName: string | null

  @Column('timestamptz', { nullable: true })
  postedAt: Date | null

  @Column('uuid', { nullable: true })
  postedBy: string | null

  @Column('text', { nullable: true })
  postedByName: string | null

  @Column('timestamptz', { nullable: true })
  cancelledAt: Date | null

  @Column('uuid', { nullable: true })
  cancelledBy: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('receipt_lines')
export class ReceiptLine {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  receiptId: string

  @Column('int')
  position: number

  @Column('uuid')
  variantId: string

  @Column('uuid', { nullable: true })
  supplierId: string | null

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  price: number

  @Column('bigint', { transformer: bigintAsNumber })
  extra: number

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  retailPrice: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  wholesalePrice: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  costUsd: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  costUzs: number | null
}

@Entity('receipt_expenses')
export class ReceiptExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  receiptId: string

  @Column('int')
  position: number

  @Column('text')
  name: string

  @Column('bigint', { transformer: bigintAsNumber })
  amount: number

  @Column('text')
  currency: AnyCurrency

  @Column('text')
  basis: ExpenseBasis

  @Column('boolean')
  isEstimate: boolean

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  amountUsd: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  amountUzs: number | null
}

@Entity('stock_batches')
export class StockBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  variantId: string

  @Column('uuid', { nullable: true })
  receiptLineId: string | null

  @Column('date')
  receivedOn: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('stock_balances')
export class StockBalance {
  @Column('uuid')
  orgId: string

  @PrimaryColumn('uuid')
  locationId: string

  @PrimaryColumn('uuid')
  batchId: string

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number
}

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  kind: StockMovementKind

  @Column('date')
  docDate: string

  @Column('text')
  documentType: string

  @Column('uuid')
  documentId: string

  @Column('uuid', { nullable: true })
  lineId: string | null

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('uuid')
  batchId: string

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  @Column('uuid', { nullable: true })
  actorId: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('stock_documents')
export class StockDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  kind: StockDocKind

  @Column('text')
  number: string

  @Column('text')
  status: StockDocStatus

  @Column('uuid')
  locationId: string

  @Column('uuid', { nullable: true })
  toLocationId: string | null

  @Column('date')
  docDate: string

  @Column('text', { nullable: true })
  reason: WriteoffReason | null

  @Column('boolean')
  fullCount: boolean

  @Column('text', { nullable: true })
  note: string | null

  @Column('numeric', { transformer: numericAsNumber })
  totalQty: number

  @Column('numeric', { nullable: true, transformer: numericAsNumber })
  diffQty: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  costUsd: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  costUzs: number | null

  @Column('text')
  searchKey: string

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @Column('text', { nullable: true })
  createdByName: string | null

  @Column('timestamptz', { nullable: true })
  sentAt: Date | null

  @Column('timestamptz', { nullable: true })
  postedAt: Date | null

  @Column('uuid', { nullable: true })
  postedBy: string | null

  @Column('text', { nullable: true })
  postedByName: string | null

  @Column('timestamptz', { nullable: true })
  cancelledAt: Date | null

  @Column('uuid', { nullable: true })
  cancelledBy: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('stock_document_lines')
export class StockDocumentLine {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  documentId: string

  @Column('int')
  position: number

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('numeric', { nullable: true, transformer: numericAsNumber })
  receivedQty: number | null

  @Column('numeric', { nullable: true, transformer: numericAsNumber })
  expectedQty: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  costUsd: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  costUzs: number | null
}

@Entity('stock_document_items')
export class StockDocumentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  documentId: string

  @Column('uuid')
  lineId: string

  @Column('int')
  position: number

  @Column('uuid')
  batchId: string

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number
}

/** One tagged piece: its code, what it is, where it was last known to be. */
@Entity('rfid_units')
export class RfidUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  epc: string

  @Column('uuid')
  variantId: string

  @Column('uuid', { nullable: true })
  batchId: string | null

  @Column('uuid', { nullable: true })
  receiptId: string | null

  @Column('int', { nullable: true })
  unitNo: number | null

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('text')
  status: UnitStatus

  @Column('uuid', { nullable: true })
  saleId: string | null

  @Column('int')
  printCount: number

  @Column('timestamptz', { nullable: true })
  lastPrintedAt: Date | null

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

/** The program in a shop that reaches its printers and readers for the server. */
@Entity('agents')
export class StoreAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('text')
  keyHash: string

  @Column('text', { nullable: true })
  hostname: string | null

  @Column('text', { nullable: true })
  version: string | null

  @Column('timestamptz', { nullable: true })
  lastSeenAt: Date | null

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('printers')
export class Printer {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  name: string

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('uuid')
  agentId: string

  @Column('text')
  host: string

  @Column('int')
  port: number

  @Column('int')
  dpi: PrinterDpi

  @Column('text')
  labelSize: LabelSizeKey

  @Column('boolean')
  rfid: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('print_jobs')
export class PrintJob {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid', { nullable: true })
  printerId: string | null

  @Column('uuid', { nullable: true })
  agentId: string | null

  @Column('text')
  printerName: string

  @Column('text')
  title: string

  @Column('int')
  labels: number

  /** The commands themselves: large, so read only when a job is sent. */
  @Column('text', { select: false })
  payload: string

  @Column('text')
  status: PrintJobStatus

  @Column('text', { nullable: true })
  error: string | null

  @Column('int')
  attempts: number

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @Column('text', { nullable: true })
  createdByName: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @Column('timestamptz', { nullable: true })
  sentAt: Date | null

  @Column('timestamptz', { nullable: true })
  doneAt: Date | null
}

/** How far above cost, or from the retail price, goods of one kind are sold. */
@Entity('price_rules')
export class PriceRule {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid', { nullable: true })
  categoryId: string | null

  @Column('uuid', { nullable: true })
  brandId: string | null

  @Column('text', { nullable: true })
  season: Season | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('price_rule_markups')
export class PriceRuleMarkup {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  ruleId: string

  @Column('uuid')
  priceTypeId: string

  @Column('text')
  base: MarkupBase

  @Column('numeric', { transformer: numericAsNumber })
  percent: number
}

/** One change of many prices at once. */
@Entity('price_revisions')
export class PriceRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  number: string

  @Column('uuid', { nullable: true })
  priceTypeId: string | null

  @Column('text')
  priceTypeName: string

  @Column('text')
  summary: string

  @Column('text', { nullable: true })
  note: string | null

  @Column('int')
  changed: number

  @Column('uuid', { nullable: true })
  revertsId: string | null

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @Column('text', { nullable: true })
  createdByName: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('price_revision_lines')
export class PriceRevisionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  revisionId: string

  @Column('uuid')
  priceTypeId: string

  @Column('uuid')
  productId: string

  @Column('uuid', { nullable: true })
  variantId: string | null

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  oldAmount: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  newAmount: number | null

  @Column('text')
  currency: CurrencyCode
}

@Entity('exchange_rates')
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('date')
  rateDate: string

  @Column('numeric', { transformer: numericAsNumber })
  uzsPerUsd: number

  @Column('uuid', { nullable: true })
  setBy: string | null

  @Column('text', { nullable: true })
  setByName: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

/** A till: a place in a shop where sales are rung up and cash is kept. */
@Entity('registers')
export class Register {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  locationId: string

  @Column('text')
  name: string

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

/** Where money is, or where it came from or went to. */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  kind: AccountKind

  @Column('text', { nullable: true })
  systemKey: SystemAccount | null

  @Column('text')
  name: string

  @Column('text')
  currency: CurrencyCode

  @Column('uuid', { nullable: true })
  locationId: string | null

  @Column('uuid', { nullable: true })
  registerId: string | null

  @Column('text', { nullable: true })
  last4: string | null

  @Column('text', { nullable: true })
  bank: string | null

  @Column('bigint', { transformer: bigintAsNumber })
  balance: number

  @Column('boolean')
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('date')
  entryDate: string

  @Column('text')
  kind: string

  @Column('text', { nullable: true })
  documentType: string | null

  @Column('uuid', { nullable: true })
  documentId: string | null

  @Column('uuid', { nullable: true })
  shiftId: string | null

  @Column('text', { nullable: true })
  note: string | null

  @Column('uuid', { nullable: true })
  createdBy: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('ledger_lines')
export class LedgerLine {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  entryId: string

  @Column('int')
  position: number

  @Column('uuid')
  accountId: string

  @Column('bigint', { transformer: bigintAsNumber })
  amount: number

  @Column('bigint', { transformer: bigintAsNumber })
  base: number
}

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  number: string

  @Column('uuid')
  registerId: string

  @Column('uuid')
  locationId: string

  @Column('text')
  status: ShiftStatus

  @Column('uuid', { nullable: true })
  openedBy: string | null

  @Column('text', { nullable: true })
  openedByName: string | null

  @Column('timestamptz')
  openedAt: Date

  @Column('bigint', { transformer: bigintAsNumber })
  openingUzs: number

  @Column('bigint', { transformer: bigintAsNumber })
  openingUsd: number

  @Column('uuid', { nullable: true })
  closedBy: string | null

  @Column('text', { nullable: true })
  closedByName: string | null

  @Column('timestamptz', { nullable: true })
  closedAt: Date | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  countedUzs: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  countedUsd: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  expectedUzs: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  expectedUsd: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  diffUzs: number | null

  @Column('bigint', { nullable: true, transformer: bigintAsNumber })
  diffUsd: number | null

  @Column('text', { nullable: true })
  note: string | null
}

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  number: string

  @Column('uuid')
  clientKey: string

  @Column('uuid')
  shiftId: string

  @Column('uuid')
  registerId: string

  @Column('uuid')
  locationId: string

  @Column('text')
  status: SaleStatus

  @Column('timestamptz')
  soldAt: Date

  @Column('date')
  soldOn: string

  @Column('uuid', { nullable: true })
  cashierId: string | null

  @Column('text', { nullable: true })
  cashierName: string | null

  @Column('uuid', { nullable: true })
  sellerId: string | null

  @Column('text', { nullable: true })
  sellerName: string | null

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  subtotal: number

  @Column('bigint', { transformer: bigintAsNumber })
  discount: number

  @Column('bigint', { transformer: bigintAsNumber })
  total: number

  @Column('numeric', { nullable: true, transformer: numericAsNumber })
  uzsPerUsd: number | null

  @Column('bigint', { transformer: bigintAsNumber })
  changeUzs: number

  /** In cents: whole dollars only. */
  @Column('bigint', { transformer: bigintAsNumber })
  changeUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  rounding: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  @Column('text')
  paidBy: string

  @Column('text', { nullable: true })
  note: string | null

  @Column('text')
  searchKey: string

  @Column('timestamptz', { nullable: true })
  voidedAt: Date | null

  @Column('uuid', { nullable: true })
  voidedBy: string | null

  @Column('text', { nullable: true })
  voidedByName: string | null

  @Column('text', { nullable: true })
  voidReason: string | null

  /** What has come back of it, in so'm. */
  @Column('bigint', { transformer: bigintAsNumber })
  returnedTotal: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('sale_lines')
export class SaleLine {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  saleId: string

  @Column('int')
  position: number

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  price: number

  @Column('bigint', { transformer: bigintAsNumber })
  discount: number

  @Column('bigint', { transformer: bigintAsNumber })
  total: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  @Column('uuid', { nullable: true })
  unitId: string | null

  @Column('numeric', { transformer: numericAsNumber })
  returnedQty: number

  @Column('bigint', { transformer: bigintAsNumber })
  returnedTotal: number
}

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  saleId: string

  @Column('uuid')
  lineId: string

  @Column('int')
  position: number

  @Column('uuid')
  batchId: string

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  /** How much of the piece has come back, and at what cost. */
  @Column('numeric', { transformer: numericAsNumber })
  returnedQty: number

  @Column('bigint', { transformer: bigintAsNumber })
  returnedUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  returnedUzs: number
}

@Entity('sale_payments')
export class SalePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  saleId: string

  @Column('int')
  position: number

  @Column('text')
  method: PaymentMethod

  @Column('uuid')
  accountId: string

  @Column('text')
  currency: CurrencyCode

  @Column('bigint', { transformer: bigintAsNumber })
  amount: number

  @Column('bigint', { transformer: bigintAsNumber })
  base: number

  @Column('text', { nullable: true })
  reference: string | null
}

@Entity('sale_returns')
export class SaleReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('text')
  number: string

  @Column('uuid')
  clientKey: string

  @Column('uuid')
  saleId: string

  @Column('uuid')
  shiftId: string

  @Column('uuid')
  registerId: string

  @Column('uuid')
  locationId: string

  @Column('timestamptz')
  returnedAt: Date

  @Column('date')
  returnedOn: string

  @Column('uuid', { nullable: true })
  cashierId: string | null

  @Column('text', { nullable: true })
  cashierName: string | null

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  total: number

  /** How much of the total went towards the goods taken instead. */
  @Column('bigint', { transformer: bigintAsNumber })
  exchangeTotal: number

  @Column('uuid', { nullable: true })
  exchangeSaleId: string | null

  @Column('bigint', { transformer: bigintAsNumber })
  rounding: number

  @Column('numeric', { nullable: true, transformer: numericAsNumber })
  uzsPerUsd: number | null

  @Column('boolean')
  late: boolean

  @Column('text', { nullable: true })
  reason: string | null

  @Column('text')
  searchKey: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

@Entity('sale_return_lines')
export class SaleReturnLine {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  returnId: string

  @Column('int')
  position: number

  @Column('uuid')
  saleLineId: string

  @Column('uuid')
  variantId: string

  @Column('numeric', { transformer: numericAsNumber })
  qty: number

  @Column('bigint', { transformer: bigintAsNumber })
  total: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUsd: number

  @Column('bigint', { transformer: bigintAsNumber })
  costUzs: number

  @Column('uuid', { nullable: true })
  unitId: string | null
}

@Entity('sale_return_payments')
export class SaleReturnPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  orgId: string

  @Column('uuid')
  returnId: string

  @Column('int')
  position: number

  @Column('text')
  method: TenderMethod

  @Column('uuid')
  accountId: string

  @Column('text')
  currency: CurrencyCode

  @Column('bigint', { transformer: bigintAsNumber })
  amount: number

  @Column('bigint', { transformer: bigintAsNumber })
  base: number

  @Column('text', { nullable: true })
  reference: string | null
}

export type StockMovementKind =
  | 'receipt'
  | 'receipt_cancel'
  | 'revalue'
  | 'transfer'
  | 'transfer_cancel'
  | 'transfer_loss'
  | 'writeoff'
  | 'writeoff_cancel'
  | 'count'
  | 'sale'
  | 'sale_void'
  | 'sale_return'

export const ENTITIES = [
  Organization,
  Location,
  Role,
  User,
  Session,
  AuditLog,
  Category,
  Brand,
  Attribute,
  AttributeValue,
  PriceType,
  Product,
  ProductVariant,
  VariantBarcode,
  Price,
  Partner,
  Receipt,
  ReceiptLine,
  ReceiptExpense,
  StockBatch,
  StockBalance,
  StockMovement,
  StockDocument,
  StockDocumentLine,
  StockDocumentItem,
  RfidUnit,
  StoreAgent,
  Printer,
  PrintJob,
  PriceRule,
  PriceRuleMarkup,
  PriceRevision,
  PriceRevisionLine,
  ExchangeRate,
  Register,
  Account,
  LedgerEntry,
  LedgerLine,
  Shift,
  Sale,
  SaleLine,
  SaleItem,
  SalePayment,
  SaleReturn,
  SaleReturnLine,
  SaleReturnPayment,
]
