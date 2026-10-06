import {
  idSchema,
  posCustomerInputSchema,
  posCustomerSearchSchema,
  posItemsSchema,
  posLookupSchema,
  posPromoCodeSchema,
  posSearchSchema,
  returnInputSchema,
  returnListQuerySchema,
  returnLookupSchema,
  saleInputSchema,
  saleListQuerySchema,
  saleVoidSchema,
  type CustomerInput,
  type Page,
  type PosContextDto,
  type PosCustomerDto,
  type PosPartnerDto,
  type PosItemDto,
  type ReturnableDto,
  type ReturnDto,
  type ReturnInput,
  type ReturnListItemDto,
  type ReturnListQuery,
  type SaleDto,
  type SaleInput,
  type SaleListItemDto,
  type SaleListQuery,
  type SaleVoidInput,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { CustomersService } from '../customers/customers.service'
import { PosService } from './pos.service'
import { ReturnsService } from './returns.service'
import { SalesService } from './sales.service'

const id = () => Param('id', zod(idSchema))

/** What the till screen asks while a sale is rung up. */
@Controller('pos')
@Can('pos.sell')
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly customers: CustomersService,
  ) {}

  @Get('context/:id')
  context(@CurrentActor() actor: Actor, @id() registerId: string): Promise<PosContextDto> {
    return this.pos.context(actor, registerId)
  }

  @Get('search')
  search(
    @CurrentActor() actor: Actor,
    @Query(zod(posSearchSchema))
    query: { registerId: string; q: string; priceTypeId: string | null; promoCode: string | null },
  ): Promise<PosItemDto[]> {
    return this.pos.search(actor, query.registerId, query.q, query.priceTypeId, query.promoCode)
  }

  @Get('lookup')
  lookup(
    @CurrentActor() actor: Actor,
    @Query(zod(posLookupSchema))
    query: { registerId: string; code: string; priceTypeId: string | null; promoCode: string | null },
  ): Promise<PosItemDto> {
    return this.pos.lookup(actor, query.registerId, query.code, query.priceTypeId, query.promoCode)
  }

  /** What a word the customer said opens, if anything: the cashier is told before the sale, not by it. */
  @Get('promo-code')
  promoCode(
    @CurrentActor() actor: Actor,
    @Query(zod(posPromoCodeSchema)) query: { registerId: string; code: string },
  ): Promise<{ name: string }[]> {
    return this.pos.promoCode(actor, query.registerId, query.code)
  }

  /** Who is at the counter: found by a few digits of their phone, or a few letters of their name. */
  @Get('customers')
  findCustomers(
    @CurrentActor() actor: Actor,
    @Query(zod(posCustomerSearchSchema)) query: { q: string },
  ): Promise<PosCustomerDto[]> {
    return this.customers.search(actor, query.q)
  }

  /** A partner buying at the till, found by their name or phone: what they owe is not the till's to see. */
  @Get('partners')
  findPartners(
    @CurrentActor() actor: Actor,
    @Query(zod(posCustomerSearchSchema)) query: { q: string },
  ): Promise<PosPartnerDto[]> {
    return this.pos.partners(actor, query.q)
  }

  /** A customer who is not on the books yet is written down where they stand, by whoever is serving them. */
  @Post('customers')
  async addCustomer(
    @CurrentActor() actor: Actor,
    @Body(zod(posCustomerInputSchema)) input: { registerId: string } & CustomerInput,
  ): Promise<PosCustomerDto> {
    const { registerId, ...customer } = input
    const { locationId } = await this.pos.registerOf(actor, registerId)
    // Who is in which group is for those who keep the base: at the till a customer is only written down.
    const saved = await this.customers.create(actor, { ...customer, groupIds: [], tags: [] }, locationId)
    return this.customers.forTill(actor, saved.id)
  }

  @Post('items')
  @HttpCode(200)
  items(
    @CurrentActor() actor: Actor,
    @Body(zod(posItemsSchema))
    input: { registerId: string; variantIds: string[]; priceTypeId: string | null; promoCode: string | null },
  ): Promise<PosItemDto[]> {
    return this.pos.items(actor, input.registerId, input.variantIds, input.priceTypeId, input.promoCode)
  }
}

/** Sales are seen by those who make them (their own) and by those allowed to see them all. */
function seesSales(actor: Actor) {
  if (!can(actor, 'pos.sell') && !can(actor, 'sales.view')) {
    throw AppError.forbidden()
  }
}

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(saleListQuerySchema)) query: SaleListQuery,
  ): Promise<Page<SaleListItemDto>> {
    seesSales(actor)
    return this.sales.list(actor, query)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() saleId: string): Promise<SaleDto> {
    seesSales(actor)
    return this.sales.get(actor, saleId)
  }

  @Post()
  @Can('pos.sell')
  create(@CurrentActor() actor: Actor, @Body(zod(saleInputSchema)) input: SaleInput): Promise<SaleDto> {
    return this.sales.create(actor, input)
  }

  @Post(':id/void')
  @HttpCode(200)
  @Can('pos.void')
  void(
    @CurrentActor() actor: Actor,
    @id() saleId: string,
    @Body(zod(saleVoidSchema)) input: SaleVoidInput,
  ): Promise<SaleDto> {
    return this.sales.void(actor, saleId, input)
  }
}

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(returnListQuerySchema)) query: ReturnListQuery,
  ): Promise<Page<ReturnListItemDto>> {
    seesSales(actor)
    return this.returns.list(actor, query)
  }

  /** The receipt goods are brought back on, by its number or by the tag of a piece it sold. */
  @Get('lookup')
  @Can('pos.return')
  lookup(
    @CurrentActor() actor: Actor,
    @Query(zod(returnLookupSchema)) query: { code: string },
  ): Promise<ReturnableDto> {
    return this.returns.lookup(actor, query.code)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() returnId: string): Promise<ReturnDto> {
    seesSales(actor)
    return this.returns.get(actor, returnId)
  }

  @Post()
  @Can('pos.return')
  create(@CurrentActor() actor: Actor, @Body(zod(returnInputSchema)) input: ReturnInput): Promise<ReturnDto> {
    return this.returns.create(actor, input)
  }
}
