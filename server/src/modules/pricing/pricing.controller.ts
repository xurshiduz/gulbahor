import {
  idSchema,
  markupLookupSchema,
  priceListQuerySchema,
  priceRevisionListQuerySchema,
  priceRuleInputSchema,
  repriceSchema,
  type MarkupLookupInput,
  type MarkupLookupResult,
  type Page,
  type PriceListItemDto,
  type PriceListQuery,
  type PriceRevisionDto,
  type PriceRevisionListQuery,
  type PriceRuleDto,
  type PriceRuleInput,
  type RepriceInput,
  type RepriceResult,
} from '@gulbahor/core'
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { PricingService } from './pricing.service'

const id = () => Param('id', zod(idSchema))

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('products')
  @Can('products.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(priceListQuerySchema)) query: PriceListQuery,
  ): Promise<Page<PriceListItemDto>> {
    return this.pricing.list(actor, query)
  }

  /** The preview and the change itself: the same request, with `dryRun` off for the second. */
  @Post('reprice')
  @HttpCode(200)
  @Can('products.prices')
  reprice(@CurrentActor() actor: Actor, @Body(zod(repriceSchema)) input: RepriceInput): Promise<RepriceResult> {
    return this.pricing.reprice(actor, input)
  }

  @Get('revisions')
  @Can('products.view')
  revisions(
    @CurrentActor() actor: Actor,
    @Query(zod(priceRevisionListQuerySchema)) query: PriceRevisionListQuery,
  ): Promise<Page<PriceRevisionDto>> {
    return this.pricing.revisions(actor, query)
  }

  @Post('revisions/:id/revert')
  @HttpCode(200)
  @Can('products.prices')
  revert(@CurrentActor() actor: Actor, @id() revisionId: string): Promise<RepriceResult> {
    return this.pricing.revert(actor, revisionId)
  }

  @Get('rules')
  @Can('products.view')
  rules(@CurrentActor() actor: Actor): Promise<PriceRuleDto[]> {
    return this.pricing.rules(actor)
  }

  @Post('rules')
  @Can('products.prices')
  createRule(
    @CurrentActor() actor: Actor,
    @Body(zod(priceRuleInputSchema)) input: PriceRuleInput,
  ): Promise<PriceRuleDto> {
    return this.pricing.saveRule(actor, null, input)
  }

  @Put('rules/:id')
  @Can('products.prices')
  updateRule(
    @CurrentActor() actor: Actor,
    @id() ruleId: string,
    @Body(zod(priceRuleInputSchema)) input: PriceRuleInput,
  ): Promise<PriceRuleDto> {
    return this.pricing.saveRule(actor, ruleId, input)
  }

  @Delete('rules/:id')
  @HttpCode(204)
  @Can('products.prices')
  removeRule(@CurrentActor() actor: Actor, @id() ruleId: string): Promise<void> {
    return this.pricing.removeRule(actor, ruleId)
  }

  /** The markup each product's rule gives it, per price type. */
  @Post('markups')
  @HttpCode(200)
  @Can('products.view')
  markups(
    @CurrentActor() actor: Actor,
    @Body(zod(markupLookupSchema)) input: MarkupLookupInput,
  ): Promise<MarkupLookupResult> {
    return this.pricing.markups(actor, input.productIds)
  }
}
