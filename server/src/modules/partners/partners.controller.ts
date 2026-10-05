import {
  idSchema,
  partnerInputSchema,
  partnerListQuerySchema,
  partnerOpeningInputSchema,
  partnerPaymentCancelSchema,
  partnerPaymentInputSchema,
  partnerPaymentListQuerySchema,
  type Page,
  type PaymentAccountDto,
  type PartnerDto,
  type PartnerInput,
  type PartnerListQuery,
  type PartnerOpeningInput,
  type PartnerPaymentDto,
  type PartnerPaymentInput,
  type PartnerPaymentListQuery,
  type PartnerStatementDto,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { PartnersService } from './partners.service'
import { PartnerPaymentsService } from './payments.service'

/** Payments are seen by those who make them and by those who may see what partners owe. */
function seesPayments(actor: Actor) {
  if (!can(actor, 'partners.pay') && !can(actor, 'partners.debts')) {
    throw AppError.forbidden()
  }
}

@Controller('partner-payments')
export class PartnerPaymentsController {
  constructor(private readonly payments: PartnerPaymentsService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(partnerPaymentListQuerySchema)) query: PartnerPaymentListQuery,
  ): Promise<Page<PartnerPaymentDto>> {
    seesPayments(actor)
    return this.payments.list(actor, query)
  }

  /** The accounts a payment can go through. */
  @Get('accounts')
  @Can('partners.pay')
  accounts(@CurrentActor() actor: Actor): Promise<PaymentAccountDto[]> {
    return this.payments.accounts(actor)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerPaymentDto> {
    seesPayments(actor)
    return this.payments.get(actor, id)
  }

  @Post()
  @Can('partners.pay')
  create(
    @CurrentActor() actor: Actor,
    @Body(zod(partnerPaymentInputSchema)) input: PartnerPaymentInput,
  ): Promise<PartnerPaymentDto> {
    return this.payments.create(actor, input)
  }

  @Post('opening')
  @Can('partners.adjust')
  opening(
    @CurrentActor() actor: Actor,
    @Body(zod(partnerOpeningInputSchema)) input: PartnerOpeningInput,
  ): Promise<PartnerPaymentDto> {
    return this.payments.opening(actor, input)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Can('partners.pay')
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(partnerPaymentCancelSchema)) input: { reason: string },
  ): Promise<PartnerPaymentDto> {
    return this.payments.cancel(actor, id, input.reason)
  }
}

@Controller('partners')
export class PartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly payments: PartnerPaymentsService,
  ) {}

  /** A partner's account: every change, and what was owed after each. */
  @Get(':id/statement')
  @Can('partners.debts')
  statement(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerStatementDto> {
    return this.payments.statement(actor, id)
  }

  @Get()
  @Can('partners.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(partnerListQuerySchema)) query: PartnerListQuery,
  ): Promise<Page<PartnerDto>> {
    return this.partners.list(actor, query)
  }

  @Get(':id')
  @Can('partners.view')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerDto> {
    return this.partners.get(actor, id)
  }

  @Post()
  @Can('partners.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(partnerInputSchema)) input: PartnerInput): Promise<PartnerDto> {
    return this.partners.create(actor, input)
  }

  @Put(':id')
  @Can('partners.manage')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(partnerInputSchema)) input: PartnerInput,
  ): Promise<PartnerDto> {
    return this.partners.update(actor, id, input)
  }

  @Post(':id/archive')
  @Can('partners.manage')
  archive(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerDto> {
    return this.partners.setActive(actor, id, false)
  }

  @Post(':id/restore')
  @Can('partners.manage')
  restore(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<PartnerDto> {
    return this.partners.setActive(actor, id, true)
  }
}
