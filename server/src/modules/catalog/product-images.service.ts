import { randomUUID } from 'node:crypto'

import {
  decodePicture,
  IMAGE_MAX_BYTES,
  IMAGE_SIZE_KEYS,
  IMAGE_SIZES,
  imageUrl,
  MAX_PRODUCT_IMAGES,
  readImageSize,
  type ImageFormat,
  type ImageSize,
  type ImageThumb,
  type ProductImageDto,
  type ProductImageInput,
  type ProductImageOrder,
  type ProductImageUpdate,
} from '@gulbahor/core'
import { Injectable } from '@nestjs/common'
import { In, type EntityManager } from 'typeorm'

import { AppError } from '../../common/errors'
import { Db } from '../../database/db.service'
import { Product, ProductImage } from '../../database/entities'
import { AuditService } from '../audit/audit.service'
import type { Actor } from '../auth/actor'
import { FileStore } from '../files/file-store'
import { RealtimeService } from '../realtime/realtime.service'
import { productFaces } from './faces'

const FIELD_OF: Record<ImageSize, 'small' | 'medium' | 'large'> = { s: 'small', m: 'medium', l: 'large' }

const extension = (format: ImageFormat) => (format === 'jpeg' ? 'jpg' : 'webp')

/** Where a photograph's files are kept: a folder of its own under its business. */
const folderOf = (orgId: string, imageId: string) => `${orgId}/${imageId}`

function toDto(image: ProductImage): ProductImageDto {
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

interface Checked {
  size: ImageSize
  data: Buffer
  format: ImageFormat
  width: number
  height: number
}

/**
 * The three sizes as they were sent, each looked at for what it really is:
 * a picture of the kind it says, no larger than its size allows. What a
 * file is called and what it claims to be prove nothing.
 */
function check(input: ProductImageInput): Checked[] {
  const fields: Record<string, string> = {}
  const checked = IMAGE_SIZE_KEYS.flatMap((size): Checked[] => {
    const field = FIELD_OF[size]
    const said = decodePicture(input[field])
    const data = said ? Buffer.from(said.base64, 'base64') : null
    const found = data ? readImageSize(data) : null
    if (!said || !data || !found || found.format !== said.format) {
      fields[field] = 'Bu rasm emas yoki formati noto‘g‘ri'
    } else if (data.length > IMAGE_MAX_BYTES[size] || Math.max(found.width, found.height) > IMAGE_SIZES[size]) {
      fields[field] = 'Rasm juda katta'
    } else {
      return [{ size, data, ...found }]
    }
    return []
  })
  if (checked.length === IMAGE_SIZE_KEYS.length && new Set(checked.map((file) => file.format)).size > 1) {
    fields.large = 'Rasmning uch o‘lchami bir xil formatda bo‘lishi kerak'
  }
  if (Object.keys(fields).length) {
    throw AppError.validation(fields)
  }
  return checked
}

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly files: FileStore,
  ) {}

  /** The photographs of these models, each model's in the order they stand. */
  async of(em: EntityManager, productIds: string[]): Promise<Map<string, ProductImageDto[]>> {
    const byProduct = new Map<string, ProductImageDto[]>()
    if (!productIds.length) {
      return byProduct
    }
    const images = await em.find(ProductImage, {
      where: { productId: In(productIds) },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
    for (const image of images) {
      byProduct.set(image.productId, [...(byProduct.get(image.productId) ?? []), toDto(image)])
    }
    return byProduct
  }

  /** The face of each model: the first of its photographs. */
  faces(em: EntityManager, productIds: string[]): Promise<Map<string, ImageThumb>> {
    return productFaces(em, productIds)
  }

  async add(actor: Actor, productId: string, input: ProductImageInput): Promise<ProductImageDto[]> {
    const files = check(input)
    const large = files.find((file) => file.size === 'l') as Checked
    const id = randomUUID()
    const folder = folderOf(actor.orgId, id)
    try {
      return await this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
        // Two photographs sent at once wait for each other here, so that neither is counted twice.
        const product = await this.lock(em, productId)
        const count = await em.countBy(ProductImage, { productId })
        if (count >= MAX_PRODUCT_IMAGES) {
          throw AppError.conflict('TOO_MANY_IMAGES', `Bir tovarga ko‘pi bilan ${MAX_PRODUCT_IMAGES} ta rasm qo‘yiladi`)
        }
        await this.assertValue(em, productId, input.valueId)

        for (const file of files) {
          await this.files.put(`${folder}/${file.size}.${extension(file.format)}`, file.data)
        }
        await em.insert(ProductImage, {
          id,
          orgId: actor.orgId,
          productId,
          valueId: input.valueId,
          sortOrder: count,
          format: large.format,
          width: large.width,
          height: large.height,
          bytes: files.reduce((sum, file) => sum + file.data.length, 0),
          blur: input.blur,
          createdBy: actor.userId,
        })
        await this.audit.record(em, actor.orgId, actor, {
          action: 'product.image.add',
          entity: 'product',
          entityId: productId,
          summary: `${product.name} (${product.sku})`,
        })
        afterCommit(() => this.realtime.changed(actor.orgId, ['products']))
        return (await this.of(em, [productId])).get(productId) ?? []
      })
    } catch (error) {
      // Nothing was written down, so nothing is kept.
      await this.files.remove(folder)
      throw error
    }
  }

  /** Says which colour a photograph shows, or that it shows them all. */
  async update(
    actor: Actor,
    productId: string,
    imageId: string,
    input: ProductImageUpdate,
  ): Promise<ProductImageDto[]> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.lock(em, productId)
      const image = await em.findOneBy(ProductImage, { id: imageId, productId })
      if (!image) {
        throw AppError.notFound('Rasm topilmadi')
      }
      await this.assertValue(em, productId, input.valueId)
      await em.update(ProductImage, imageId, { valueId: input.valueId })
      afterCommit(() => this.realtime.changed(actor.orgId, ['products']))
      return (await this.of(em, [productId])).get(productId) ?? []
    })
  }

  /** Puts the photographs in the order given; the first becomes the model's face. */
  async reorder(actor: Actor, productId: string, input: ProductImageOrder): Promise<ProductImageDto[]> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      await this.lock(em, productId)
      const images = await em.findBy(ProductImage, { productId })
      const known = new Set(images.map((image) => image.id))
      if (new Set(input.ids).size !== known.size || !input.ids.every((id) => known.has(id))) {
        throw AppError.conflict('IMAGES_CHANGED', 'Rasmlar o‘zgargan. Sahifani yangilang')
      }
      for (const [index, id] of input.ids.entries()) {
        await em.update(ProductImage, id, { sortOrder: index })
      }
      afterCommit(() => this.realtime.changed(actor.orgId, ['products']))
      return (await this.of(em, [productId])).get(productId) ?? []
    })
  }

  async remove(actor: Actor, productId: string, imageId: string): Promise<ProductImageDto[]> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const product = await this.lock(em, productId)
      const image = await em.findOneBy(ProductImage, { id: imageId, productId })
      if (!image) {
        throw AppError.notFound('Rasm topilmadi')
      }
      await em.delete(ProductImage, imageId)
      // The rest close up, so that the order has no holes for the next photograph to fall into.
      const rest = await em.find(ProductImage, { where: { productId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } })
      for (const [index, other] of rest.entries()) {
        if (other.sortOrder !== index) {
          await em.update(ProductImage, other.id, { sortOrder: index })
        }
      }
      await this.audit.record(em, actor.orgId, actor, {
        action: 'product.image.remove',
        entity: 'product',
        entityId: productId,
        summary: `${product.name} (${product.sku})`,
      })
      afterCommit(() => {
        this.realtime.changed(actor.orgId, ['products'])
        return this.discard(actor.orgId, [imageId])
      })
      return (await this.of(em, [productId])).get(productId) ?? []
    })
  }

  /** The photographs a model has, for whoever is about to delete the model. */
  async idsOf(em: EntityManager, productId: string): Promise<string[]> {
    const images = await em.find(ProductImage, { where: { productId }, select: { id: true } })
    return images.map((image) => image.id)
  }

  /** Throws away the files of photographs that are no longer written down anywhere. */
  async discard(orgId: string, imageIds: string[]): Promise<void> {
    for (const id of imageIds) {
      await this.files.remove(folderOf(orgId, id))
    }
  }

  private async lock(em: EntityManager, productId: string): Promise<Product> {
    const product = await em.findOne(Product, { where: { id: productId }, lock: { mode: 'pessimistic_write' } })
    if (!product) {
      throw AppError.notFound('Tovar topilmadi')
    }
    return product
  }

  /** A photograph is of a colour the model comes in, or of none in particular. */
  private async assertValue(em: EntityManager, productId: string, valueId: string | null): Promise<void> {
    if (!valueId) {
      return
    }
    const [used]: { id: string }[] = await em.query(
      `SELECT id FROM product_variants WHERE product_id = $1 AND $2 IN (value1_id, value2_id, value3_id) LIMIT 1`,
      [productId, valueId],
    )
    if (!used) {
      throw AppError.validation({ valueId: 'Bu tovarda bunday rang yoki o‘lcham yo‘q' })
    }
  }
}
