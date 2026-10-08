import type { AttributeDto, BrandDto, CategoryDto, PriceTypeDto } from '@erp/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ComboOption } from '@/components/ui/combobox'
import { api } from '@/lib/api'

/**
 * The lists every catalogue screen needs. They are small and change rarely,
 * so each is fetched whole and kept fresh by the live connection.
 */
export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => api.get<CategoryDto[]>('/categories', undefined, signal),
  })

export const useBrands = () =>
  useQuery({ queryKey: ['brands'], queryFn: ({ signal }) => api.get<BrandDto[]>('/brands', undefined, signal) })

export const useAttributes = () =>
  useQuery({
    queryKey: ['attributes'],
    queryFn: ({ signal }) => api.get<AttributeDto[]>('/attributes', undefined, signal),
  })

export const usePriceTypes = () =>
  useQuery({
    queryKey: ['price-types'],
    queryFn: ({ signal }) => api.get<PriceTypeDto[]>('/price-types', undefined, signal),
  })

export interface CategoryNode extends CategoryDto {
  depth: number
  /** "Erkaklar kiyimi / Futbolkalar" */
  path: string
}

/** The tree flattened top-down, each category right after its parent, with its depth and full path. */
export function categoryTree(categories: CategoryDto[]): CategoryNode[] {
  const children = new Map<string | null, CategoryDto[]>()
  for (const category of categories) {
    const siblings = children.get(category.parentId) ?? []
    siblings.push(category)
    children.set(category.parentId, siblings)
  }
  const result: CategoryNode[] = []
  const walk = (parentId: string | null, depth: number, prefix: string) => {
    for (const category of children.get(parentId) ?? []) {
      const path = prefix ? `${prefix} / ${category.name}` : category.name
      result.push({ ...category, depth, path })
      walk(category.id, depth + 1, path)
    }
  }
  walk(null, 0, '')
  return result
}

export function useCategoryOptions(categories: CategoryDto[] | undefined, keep?: string | null): ComboOption[] {
  return useMemo(
    () =>
      categoryTree(categories ?? [])
        .filter((category) => category.isActive || category.id === keep)
        .map((category) => ({ value: category.id, label: category.path })),
    [categories, keep],
  )
}

/** The axes a new model in this category starts with: its own, or the nearest ancestor's. */
export function categoryAxisIds(categories: CategoryDto[], categoryId: string | null): string[] | null {
  const byId = new Map(categories.map((category) => [category.id, category]))
  let cursor = categoryId ? byId.get(categoryId) : undefined
  while (cursor) {
    if (cursor.axisIds) {
      return cursor.axisIds
    }
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return null
}

/** Colour and the first size scale: what a model starts with when its category says nothing. */
export function defaultAxisIds(attributes: AttributeDto[]): string[] {
  const active = attributes.filter((attribute) => attribute.isActive)
  const color = active.find((attribute) => attribute.kind === 'color')
  const size = active.find((attribute) => attribute.kind === 'size')
  return [color, size].filter((attribute): attribute is AttributeDto => !!attribute).map((attribute) => attribute.id)
}
