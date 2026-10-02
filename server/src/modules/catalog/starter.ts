import type { AttributeKind, PriceKind } from '@gulbahor/core'
import type { EntityManager } from 'typeorm'

import { Attribute, AttributeValue, Category, PriceType } from '../../database/entities'

/**
 * What a clothing business starts with, so the first model can be entered
 * without building every list by hand. All of it can be renamed, archived
 * or removed afterwards.
 */

const PRICE_TYPES: { name: string; kind: PriceKind }[] = [
  { name: 'Chakana', kind: 'retail' },
  { name: 'Ulgurji', kind: 'wholesale' },
  { name: 'Minimal', kind: 'min' },
]

const COLORS: [name: string, hex: string][] = [
  ['Oq', '#FFFFFF'],
  ['Qora', '#000000'],
  ['Kulrang', '#9E9E9E'],
  ['Qizil', '#E53935'],
  ['Bordo', '#7B1E3A'],
  ['Pushti', '#F48FB1'],
  ["To'q sariq", '#FB8C00'],
  ['Sariq', '#FDD835'],
  ['Yashil', '#43A047'],
  ['Xaki', '#7C7A4B'],
  ['Havorang', '#64B5F6'],
  ["Ko'k", '#1E88E5'],
  ["To'q ko'k", '#1A237E'],
  ['Binafsha', '#8E24AA'],
  ['Jigarrang', '#6D4C41'],
  ['Bej', '#D9C7A7'],
]

const ATTRIBUTES: { key: string; name: string; kind: AttributeKind; values: [name: string, hex?: string][] }[] = [
  { key: 'color', name: 'Rang', kind: 'color', values: COLORS },
  {
    key: 'alpha',
    name: "O'lcham (harfli)",
    kind: 'size',
    values: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'].map((name) => [name]),
  },
  { key: 'numeric', name: "O'lcham (raqamli)", kind: 'size', values: range(38, 60, 2).map((size) => [String(size)]) },
  { key: 'jeans', name: 'Jinsi (bel)', kind: 'size', values: range(26, 40, 1).map((size) => [String(size)]) },
  { key: 'shoes', name: "Poyabzal o'lchami", kind: 'size', values: range(35, 46, 1).map((size) => [String(size)]) },
  { key: 'kids', name: "Bolalar bo'yi", kind: 'size', values: range(80, 164, 6).map((size) => [String(size)]) },
]

/** `axes` names the attributes a model in the category starts with; without it the business default applies. */
const CATEGORIES: { name: string; axes?: string[]; children?: { name: string; axes?: string[] }[] }[] = [
  {
    name: 'Erkaklar kiyimi',
    children: [
      { name: "Ko'ylaklar" },
      { name: 'Futbolkalar' },
      { name: 'Shimlar', axes: ['color', 'numeric'] },
      { name: 'Jinsilar', axes: ['color', 'jeans'] },
      { name: 'Kostyumlar', axes: ['color', 'numeric'] },
      { name: 'Ustki kiyim' },
    ],
  },
  {
    name: 'Ayollar kiyimi',
    children: [
      { name: "Ko'ylaklar" },
      { name: 'Bluzkalar' },
      { name: 'Yubkalar' },
      { name: 'Shimlar', axes: ['color', 'numeric'] },
      { name: 'Jinsilar', axes: ['color', 'jeans'] },
      { name: 'Ustki kiyim' },
    ],
  },
  {
    name: 'Bolalar kiyimi',
    axes: ['color', 'kids'],
    children: [{ name: "O'g'il bolalar" }, { name: 'Qiz bolalar' }, { name: 'Chaqaloqlar' }],
  },
  { name: 'Poyabzal', axes: ['color', 'shoes'] },
  { name: 'Aksessuarlar', axes: ['color'] },
]

function range(from: number, to: number, step: number): number[] {
  const result: number[] = []
  for (let value = from; value <= to; value += step) {
    result.push(value)
  }
  return result
}

/** Every business needs its price types from the first day. */
export async function createPriceTypes(em: EntityManager, orgId: string): Promise<void> {
  await em.insert(
    PriceType,
    PRICE_TYPES.map((type, index) => ({
      orgId,
      name: type.name,
      kind: type.kind,
      currency: 'UZS' as const,
      // Prices in so'm are round thousands unless the business says otherwise.
      roundStep: 100_000,
      roundEnding: 0,
      sortOrder: index + 1,
      isActive: true,
    })),
  )
}

/**
 * Colours, size scales and categories. Does nothing for a business that
 * already has attributes or categories, so it never doubles what is there.
 * Returns whether anything was added.
 */
export async function applyStarter(em: EntityManager, orgId: string): Promise<boolean> {
  if ((await em.countBy(Attribute, { orgId })) || (await em.countBy(Category, { orgId }))) {
    return false
  }

  const attributeIds = new Map<string, string>()
  for (const [index, attribute] of ATTRIBUTES.entries()) {
    const saved = await em.save(
      em.create(Attribute, { orgId, name: attribute.name, kind: attribute.kind, sortOrder: index + 1, isActive: true }),
    )
    attributeIds.set(attribute.key, saved.id)
    await em.insert(
      AttributeValue,
      attribute.values.map(([name, hex], position) => ({
        orgId,
        attributeId: saved.id,
        name,
        hex: hex ?? null,
        sortOrder: position + 1,
        isActive: true,
      })),
    )
  }

  const axisIds = (keys: string[] | undefined) => (keys ? keys.map((key) => attributeIds.get(key) as string) : null)
  for (const [index, category] of CATEGORIES.entries()) {
    const parent = await em.save(
      em.create(Category, {
        orgId,
        name: category.name,
        parentId: null,
        axisIds: axisIds(category.axes),
        sortOrder: index + 1,
        isActive: true,
      }),
    )
    if (category.children?.length) {
      await em.insert(
        Category,
        category.children.map((child, position) => ({
          orgId,
          name: child.name,
          parentId: parent.id,
          axisIds: axisIds(child.axes),
          sortOrder: position + 1,
          isActive: true,
        })),
      )
    }
  }
  return true
}
