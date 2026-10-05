import {
  idSchema,
  productImageInputSchema,
  productImageOrderSchema,
  productImageUpdateSchema,
  type ProductImageDto,
  type ProductImageInput,
  type ProductImageOrder,
  type ProductImageUpdate,
} from '@gulbahor/core'
import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { ProductImagesService } from './product-images.service'

/** A model's photographs. Every change answers with all of them as they now stand. */
@Controller('products/:id/images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post()
  @HttpCode(200)
  @Can('products.manage')
  add(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(productImageInputSchema)) input: ProductImageInput,
  ): Promise<ProductImageDto[]> {
    return this.images.add(actor, id, input)
  }

  @Put('order')
  @Can('products.manage')
  reorder(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(productImageOrderSchema)) input: ProductImageOrder,
  ): Promise<ProductImageDto[]> {
    return this.images.reorder(actor, id, input)
  }

  @Patch(':imageId')
  @Can('products.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Param('imageId', zod(idSchema)) imageId: string,
    @Body(zod(productImageUpdateSchema)) input: ProductImageUpdate,
  ): Promise<ProductImageDto[]> {
    return this.images.update(actor, id, imageId, input)
  }

  @Delete(':imageId')
  @Can('products.manage')
  remove(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Param('imageId', zod(idSchema)) imageId: string,
  ): Promise<ProductImageDto[]> {
    return this.images.remove(actor, id, imageId)
  }
}
