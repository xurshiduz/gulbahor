import type { AttributeKind, CurrencyCode, Gender, LocationKind, OrgSettings, PriceKind, Season, Unit } from '@gulbahor/core'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

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
]
