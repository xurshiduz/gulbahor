import {
  attributeInputSchema,
  attributeValueInputSchema,
  attributeValueMergeSchema,
  attributeValuesBulkSchema,
  brandInputSchema,
  categoryInputSchema,
  idSchema,
  orderSchema,
  priceTypeInputSchema,
  type AttributeDto,
  type AttributeInput,
  type AttributeValueInput,
  type AttributeValueMergeInput,
  type AttributeValuesBulkInput,
  type BrandDto,
  type BrandInput,
  type CategoryDto,
  type CategoryInput,
  type OrderInput,
  type PriceTypeDto,
  type PriceTypeInput,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Db } from '../../database/db.service'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { RealtimeService } from '../realtime/realtime.service'
import { AttributesService } from './attributes.service'
import { BrandsService } from './brands.service'
import { CategoriesService } from './categories.service'
import { PriceTypesService } from './price-types.service'
import { applyStarter } from './starter'

const id = () => Param('id', zod(idSchema))

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Can('products.view')
  list(@CurrentActor() actor: Actor): Promise<CategoryDto[]> {
    return this.categories.list(actor)
  }

  @Post()
  @Can('products.references')
  create(@CurrentActor() actor: Actor, @Body(zod(categoryInputSchema)) input: CategoryInput): Promise<CategoryDto> {
    return this.categories.create(actor, input)
  }

  @Put(':id')
  @Can('products.references')
  update(
    @CurrentActor() actor: Actor,
    @id() categoryId: string,
    @Body(zod(categoryInputSchema)) input: CategoryInput,
  ): Promise<CategoryDto> {
    return this.categories.update(actor, categoryId, input)
  }

  @Post(':id/archive')
  @Can('products.references')
  archive(@CurrentActor() actor: Actor, @id() categoryId: string): Promise<CategoryDto> {
    return this.categories.setActive(actor, categoryId, false)
  }

  @Post(':id/restore')
  @Can('products.references')
  restore(@CurrentActor() actor: Actor, @id() categoryId: string): Promise<CategoryDto> {
    return this.categories.setActive(actor, categoryId, true)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('products.references')
  remove(@CurrentActor() actor: Actor, @id() categoryId: string): Promise<void> {
    return this.categories.remove(actor, categoryId)
  }
}

@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @Can('products.view')
  list(@CurrentActor() actor: Actor): Promise<BrandDto[]> {
    return this.brands.list(actor)
  }

  @Post()
  @Can('products.references')
  create(@CurrentActor() actor: Actor, @Body(zod(brandInputSchema)) input: BrandInput): Promise<BrandDto> {
    return this.brands.create(actor, input)
  }

  @Put(':id')
  @Can('products.references')
  update(
    @CurrentActor() actor: Actor,
    @id() brandId: string,
    @Body(zod(brandInputSchema)) input: BrandInput,
  ): Promise<BrandDto> {
    return this.brands.update(actor, brandId, input)
  }

  @Post(':id/archive')
  @Can('products.references')
  archive(@CurrentActor() actor: Actor, @id() brandId: string): Promise<BrandDto> {
    return this.brands.setActive(actor, brandId, false)
  }

  @Post(':id/restore')
  @Can('products.references')
  restore(@CurrentActor() actor: Actor, @id() brandId: string): Promise<BrandDto> {
    return this.brands.setActive(actor, brandId, true)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('products.references')
  remove(@CurrentActor() actor: Actor, @id() brandId: string): Promise<void> {
    return this.brands.remove(actor, brandId)
  }
}

@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  @Can('products.view')
  list(@CurrentActor() actor: Actor): Promise<AttributeDto[]> {
    return this.attributes.list(actor)
  }

  @Post()
  @Can('products.references')
  create(@CurrentActor() actor: Actor, @Body(zod(attributeInputSchema)) input: AttributeInput): Promise<AttributeDto> {
    return this.attributes.create(actor, input)
  }

  @Put('values/:id')
  @Can('products.references')
  updateValue(
    @CurrentActor() actor: Actor,
    @id() valueId: string,
    @Body(zod(attributeValueInputSchema)) input: AttributeValueInput,
  ): Promise<AttributeDto> {
    return this.attributes.updateValue(actor, valueId, input)
  }

  @Post('values/:id/merge')
  @HttpCode(200)
  @Can('products.references')
  mergeValue(
    @CurrentActor() actor: Actor,
    @id() valueId: string,
    @Body(zod(attributeValueMergeSchema)) input: AttributeValueMergeInput,
  ): Promise<AttributeDto> {
    return this.attributes.mergeValue(actor, valueId, input)
  }

  @Post('values/:id/archive')
  @Can('products.references')
  archiveValue(@CurrentActor() actor: Actor, @id() valueId: string): Promise<AttributeDto> {
    return this.attributes.setValueActive(actor, valueId, false)
  }

  @Post('values/:id/restore')
  @Can('products.references')
  restoreValue(@CurrentActor() actor: Actor, @id() valueId: string): Promise<AttributeDto> {
    return this.attributes.setValueActive(actor, valueId, true)
  }

  @Delete('values/:id')
  @Can('products.references')
  removeValue(@CurrentActor() actor: Actor, @id() valueId: string): Promise<AttributeDto> {
    return this.attributes.removeValue(actor, valueId)
  }

  @Put(':id')
  @Can('products.references')
  update(
    @CurrentActor() actor: Actor,
    @id() attributeId: string,
    @Body(zod(attributeInputSchema)) input: AttributeInput,
  ): Promise<AttributeDto> {
    return this.attributes.update(actor, attributeId, input)
  }

  @Post(':id/archive')
  @Can('products.references')
  archive(@CurrentActor() actor: Actor, @id() attributeId: string): Promise<AttributeDto> {
    return this.attributes.setActive(actor, attributeId, false)
  }

  @Post(':id/restore')
  @Can('products.references')
  restore(@CurrentActor() actor: Actor, @id() attributeId: string): Promise<AttributeDto> {
    return this.attributes.setActive(actor, attributeId, true)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('products.references')
  remove(@CurrentActor() actor: Actor, @id() attributeId: string): Promise<void> {
    return this.attributes.remove(actor, attributeId)
  }

  @Post(':id/values')
  @Can('products.references')
  addValues(
    @CurrentActor() actor: Actor,
    @id() attributeId: string,
    @Body(zod(attributeValuesBulkSchema)) input: AttributeValuesBulkInput,
  ): Promise<AttributeDto> {
    return this.attributes.addValues(actor, attributeId, input)
  }

  @Put(':id/values/order')
  @Can('products.references')
  reorderValues(
    @CurrentActor() actor: Actor,
    @id() attributeId: string,
    @Body(zod(orderSchema)) input: OrderInput,
  ): Promise<AttributeDto> {
    return this.attributes.reorderValues(actor, attributeId, input)
  }
}

@Controller('price-types')
export class PriceTypesController {
  constructor(private readonly priceTypes: PriceTypesService) {}

  @Get()
  @Can('products.view')
  list(@CurrentActor() actor: Actor): Promise<PriceTypeDto[]> {
    return this.priceTypes.list(actor)
  }

  @Post()
  @Can('products.prices')
  create(@CurrentActor() actor: Actor, @Body(zod(priceTypeInputSchema)) input: PriceTypeInput): Promise<PriceTypeDto> {
    return this.priceTypes.create(actor, input)
  }

  @Put(':id')
  @Can('products.prices')
  update(
    @CurrentActor() actor: Actor,
    @id() typeId: string,
    @Body(zod(priceTypeInputSchema)) input: PriceTypeInput,
  ): Promise<PriceTypeDto> {
    return this.priceTypes.update(actor, typeId, input)
  }

  @Post(':id/archive')
  @Can('products.prices')
  archive(@CurrentActor() actor: Actor, @id() typeId: string): Promise<PriceTypeDto> {
    return this.priceTypes.setActive(actor, typeId, false)
  }

  @Post(':id/restore')
  @Can('products.prices')
  restore(@CurrentActor() actor: Actor, @id() typeId: string): Promise<PriceTypeDto> {
    return this.priceTypes.setActive(actor, typeId, true)
  }

  @Delete(':id')
  @HttpCode(204)
  @Can('products.prices')
  remove(@CurrentActor() actor: Actor, @id() typeId: string): Promise<void> {
    return this.priceTypes.remove(actor, typeId)
  }
}

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  /** Fills an empty catalogue with the colours, size scales and categories a clothing shop starts with. */
  @Post('starter')
  @Can('products.references')
  starter(@CurrentActor() actor: Actor): Promise<{ applied: boolean }> {
    return this.db.tenant(actor.orgId, async ({ em, afterCommit }) => {
      const applied = await applyStarter(em, actor.orgId)
      if (applied) {
        afterCommit(() => this.realtime.changed(actor.orgId, ['attributes', 'categories']))
      }
      return { applied }
    })
  }
}
