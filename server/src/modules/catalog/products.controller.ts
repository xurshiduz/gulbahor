import {
  idSchema,
  lookupQuerySchema,
  productInputSchema,
  productListQuerySchema,
  type Page,
  type ProductDto,
  type ProductInput,
  type ProductListItemDto,
  type ProductListQuery,
  type VariantLookupDto,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { ProductsService } from './products.service'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Can('products.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(productListQuerySchema)) query: ProductListQuery,
  ): Promise<Page<ProductListItemDto>> {
    return this.products.list(actor, query)
  }

  @Get('lookup')
  @Can('products.view')
  lookup(
    @CurrentActor() actor: Actor,
    @Query(zod(lookupQuerySchema)) query: { code: string },
  ): Promise<VariantLookupDto> {
    return this.products.lookup(actor, query.code)
  }

  @Get(':id')
  @Can('products.view')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<ProductDto> {
    return this.products.get(actor, id)
  }

  @Post()
  @Can('products.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(productInputSchema)) input: ProductInput): Promise<ProductDto> {
    return this.products.create(actor, input)
  }

  @Put(':id')
  @Can('products.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(productInputSchema)) input: ProductInput,
  ): Promise<ProductDto> {
    return this.products.update(actor, id, input)
  }

  @Post(':id/archive')
  @Can('products.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<ProductDto> {
    return this.products.setActive(actor, id, false)
  }

  @Post(':id/restore')
  @Can('products.manage')
  restore(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<ProductDto> {
    return this.products.setActive(actor, id, true)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('products.manage')
  remove(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<void> {
    return this.products.remove(actor, id)
  }
}
