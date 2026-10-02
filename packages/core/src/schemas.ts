import { z } from 'zod'

import { MODULE_KEYS } from './access'
import type { CurrencyCode } from './money'
import { parsePhone } from './phone'

/**
 * The API contract: what each request must look like and what comes back.
 * The server validates with these; the web forms validate with the same
 * schemas, so a form never accepts what the server would reject.
 */

/** Uzbek messages for the checks zod runs on its own. Call once at start-up. */
export function configureValidationMessages(): void {
  z.config({
    customError: (issue) => {
      switch (issue.code) {
        case 'invalid_type':
          return issue.input === undefined || issue.input === null ? 'Majburiy maydon' : "Noto'g'ri qiymat"
        case 'too_small':
          if (issue.origin === 'string') {
            return Number(issue.minimum) <= 1 ? 'Majburiy maydon' : `Kamida ${issue.minimum} ta belgi bo'lishi kerak`
          }
          if (issue.origin === 'array' || issue.origin === 'set') {
            return `Kamida ${issue.minimum} ta tanlang`
          }
          return `${issue.minimum} dan kichik bo'lmasligi kerak`
        case 'too_big':
          if (issue.origin === 'string') {
            return `Ko'pi bilan ${issue.maximum} ta belgi bo'lishi mumkin`
          }
          return `${issue.maximum} dan katta bo'lmasligi kerak`
        case 'invalid_format':
          return "Format noto'g'ri"
        case 'invalid_value':
          return "Noto'g'ri qiymat"
        default:
          return undefined
      }
    },
  })
}

// ───────────────────────────── Common ─────────────────────────────

export const idSchema = z.uuid()

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().trim().max(100).optional(),
})
export type ListQuery = z.infer<typeof listQuerySchema>

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export const requiredText = (max: number) => z.string().trim().min(1).max(max)
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null)

export const phoneSchema = z
  .string()
  .trim()
  .refine((value) => parsePhone(value).ok, { message: "Telefon raqam to'liq emas" })
  .transform((value) => {
    const parsed = parsePhone(value)
    return parsed.ok ? parsed.e164 : value
  })

export const optionalPhoneSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  phoneSchema.nullable(),
)

// ───────────────────────────── Auth ─────────────────────────────

export const loginNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9._-]+$/, { message: 'Faqat lotin harflari, raqam, nuqta, chiziqcha' })

export const passwordSchema = z.string().min(8).max(100)

export const pinSchema = z.string().regex(/^\d{4,6}$/, { message: 'PIN 4–6 ta raqamdan iborat' })

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1).max(40),
  password: z.string().min(1).max(100),
})
export type LoginInput = z.infer<typeof loginSchema>

export const changePasswordSchema = z.object({
  current: z.string().min(1).max(100),
  next: passwordSchema,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const setPinSchema = z.object({
  password: z.string().min(1).max(100),
  pin: pinSchema,
})
export type SetPinInput = z.infer<typeof setPinSchema>

export const unlockSchema = z.object({ pin: pinSchema })

export const LANGUAGES = ['uz', 'ru'] as const
export type Language = (typeof LANGUAGES)[number]

export const profileSchema = z.object({
  fullName: requiredText(120),
  language: z.enum(LANGUAGES),
})
export type ProfileInput = z.infer<typeof profileSchema>

export interface SessionDto {
  id: string
  device: string
  ip: string | null
  createdAt: string
  lastUsedAt: string
  current: boolean
}

export interface MeDto {
  user: {
    id: string
    fullName: string
    login: string
    phone: string | null
    language: Language
    hasPin: boolean
    mustChangePassword: boolean
    roles: { id: string; name: string }[]
    isOwner: boolean
    permissions: string[]
    allLocations: boolean
    locationIds: string[]
  }
  org: OrgDto
}

// ───────────────────────────── Organization ─────────────────────────────

export interface OrgSettings {
  /** Lock the screen after this many idle minutes; 0 turns locking off. */
  autoLockMinutes: number
  /** Change in so'm is handed back in steps of this (tiyin): the smallest note the tills keep. 0 gives it to the tiyin. */
  changeRoundStep: number
  /** A cashier may take this much off a sale, in percent; more needs someone allowed to go over. */
  maxDiscountPercent: number
  /** Goods are taken back for this many days after the sale; later needs someone allowed to. 0 sets no limit. */
  returnDays: number
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  autoLockMinutes: 10,
  changeRoundStep: 100_000,
  maxDiscountPercent: 10,
  returnDays: 14,
}

export interface OrgDto {
  id: string
  name: string
  timezone: string
  baseCurrency: CurrencyCode
  modules: string[]
  settings: OrgSettings
  setupCompleted: boolean
}

export const orgUpdateSchema = z.object({
  name: requiredText(120),
  settings: z.object({
    autoLockMinutes: z.coerce.number().int().min(0).max(240),
    // Left out, each stays as it is.
    changeRoundStep: z.coerce.number().int().min(0).max(100_000_00).optional(),
    maxDiscountPercent: z.coerce.number().min(0).max(100).optional(),
    returnDays: z.coerce.number().int().min(0).max(3650).optional(),
  }),
})
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>

export const modulesSchema = z.object({
  modules: z.array(z.enum(MODULE_KEYS as [string, ...string[]])).max(MODULE_KEYS.length),
})
export type ModulesInput = z.infer<typeof modulesSchema>

// ───────────────────────────── Locations ─────────────────────────────

export const LOCATION_KINDS = ['store', 'warehouse', 'mixed', 'zone'] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  store: "Do'kon",
  warehouse: 'Sklad',
  mixed: "Do'kon va sklad",
  zone: "Do'kon ichidagi joy",
}

export const locationInputSchema = z
  .object({
    name: requiredText(80),
    kind: z.enum(LOCATION_KINDS),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .max(8)
      .regex(/^[A-Z0-9-]*$/, { message: 'Faqat lotin harflari va raqam' })
      .nullish()
      .transform((value) => value || null),
    parentId: idSchema.nullish().transform((value) => value || null),
    address: optionalText(200),
    phone: optionalPhoneSchema,
  })
  .refine((value) => value.kind !== 'zone' || !!value.parentId, {
    path: ['parentId'],
    message: "Qaysi do'kon ichida ekanini tanlang",
  })
  .refine((value) => value.kind === 'zone' || !value.parentId, {
    path: ['parentId'],
    message: "Faqat do'kon ichidagi joy boshqa joyga biriktiriladi",
  })
export type LocationInput = z.infer<typeof locationInputSchema>

export interface LocationDto {
  id: string
  name: string
  code: string
  kind: LocationKind
  parentId: string | null
  parentName: string | null
  address: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
}

export const locationListQuerySchema = listQuerySchema.extend({
  kind: z.enum(LOCATION_KINDS).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
})
export type LocationListQuery = z.infer<typeof locationListQuerySchema>

// ───────────────────────────── Setup wizard ─────────────────────────────

export const setupSchema = z.object({
  name: requiredText(120),
  useUsd: z.boolean(),
  locations: z
    .array(z.object({ name: requiredText(80), kind: z.enum(['store', 'warehouse', 'mixed']) }))
    .min(1, { message: "Kamida bitta do'kon yoki sklad kiriting" })
    .max(50),
  modules: z.array(z.enum(MODULE_KEYS as [string, ...string[]])),
})
export type SetupInput = z.infer<typeof setupSchema>

// ───────────────────────────── Roles ─────────────────────────────

export const roleInputSchema = z.object({
  name: requiredText(60),
  description: optionalText(200),
  permissions: z.array(z.string().max(60)).max(200),
})
export type RoleInput = z.infer<typeof roleInputSchema>

export interface RoleDto {
  id: string
  name: string
  description: string | null
  templateKey: string | null
  permissions: string[]
  isSystem: boolean
  userCount: number
}

// ───────────────────────────── Users ─────────────────────────────

const userBase = {
  fullName: requiredText(120),
  phone: optionalPhoneSchema,
  roleIds: z.array(idSchema).min(1, { message: 'Kamida bitta rol tanlang' }),
  allLocations: z.boolean(),
  locationIds: z.array(idSchema),
  language: z.enum(LANGUAGES).default('uz'),
}

const locationsChosen = (value: { allLocations: boolean; locationIds: string[] }) =>
  value.allLocations || value.locationIds.length > 0

export const userCreateSchema = z
  .object({ ...userBase, login: loginNameSchema, password: passwordSchema })
  .refine(locationsChosen, { path: ['locationIds'], message: "Kamida bitta do'kon yoki sklad tanlang" })
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z
  .object({ ...userBase, login: loginNameSchema })
  .refine(locationsChosen, { path: ['locationIds'], message: "Kamida bitta do'kon yoki sklad tanlang" })
export type UserUpdateInput = z.infer<typeof userUpdateSchema>

export const resetPasswordSchema = z.object({ password: passwordSchema })

export const userListQuerySchema = listQuerySchema.extend({
  status: z.enum(['active', 'blocked', 'all']).default('all'),
  roleId: idSchema.optional(),
  locationId: idSchema.optional(),
})
export type UserListQuery = z.infer<typeof userListQuerySchema>

export interface UserDto {
  id: string
  fullName: string
  login: string
  phone: string | null
  language: Language
  isActive: boolean
  isOwner: boolean
  allLocations: boolean
  roles: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  lastLoginAt: string | null
  createdAt: string
}

// ───────────────────────────── Audit ─────────────────────────────

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
  actorId: idSchema.optional(),
  entity: z.string().max(40).optional(),
  action: z.string().max(60).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export type AuditListQuery = z.infer<typeof auditListQuerySchema>

export interface AuditDto {
  id: string
  at: string
  actorId: string | null
  actorName: string | null
  action: string
  entity: string | null
  entityId: string | null
  summary: string | null
  changes: Record<string, [unknown, unknown]> | null
  ip: string | null
}

// ───────────────────────────── Preferences ─────────────────────────────

export const preferenceSchema = z.object({ value: z.unknown() })
