import {
  customerAdjustInputSchema,
  customerExchangeInputSchema,
  customerTransferInputSchema,
  customerOpeningInputSchema,
  customerPaymentCancelSchema,
  customerPaymentInputSchema,
  customerPaymentListQuerySchema,
  idSchema,
  type CustomerAdjustInput,
  type CustomerExchangeInput,
  type CustomerTransferInput,
  type CustomerOpeningInput,
  type CustomerPaymentDto,
  type CustomerPaymentInput,
  type CustomerPaymentListQuery,
  type Page,
  type PaymentAccountDto,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { CustomerPaymentsService } from './payments.service'

/** Payments are seen by those who make them and by those who may see what customers owe. */
function seesPayments(actor: Actor) {
  const keys = ['customers.receive', 'customers.pay_out', 'customers.debts', 'customers.suppliers']
  if (!keys.some((key) => can(actor, key))) {
    throw AppError.forbidden()
  }
}

@Controller('customer-payments')
export class CustomerPaymentsController {
  constructor(private readonly payments: CustomerPaymentsService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(customerPaymentListQuerySchema)) query: CustomerPaymentListQuery,
  ): Promise<Page<CustomerPaymentDto>> {
    seesPayments(actor)
    return this.payments.list(actor, query)
  }

  /** The accounts a payment can go through; asked from a till, its shop's terminals too. */
  @Get('accounts')
  accounts(
    @CurrentActor() actor: Actor,
    @Query('registerId', zod(idSchema.optional())) registerId?: string,
  ): Promise<PaymentAccountDto[]> {
    if (!can(actor, 'customers.receive') && !can(actor, 'customers.pay_out') && !can(actor, 'pos.sell')) {
      throw AppError.forbidden()
    }
    return this.payments.accounts(actor, registerId)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', zod(idSchema)) id: string): Promise<CustomerPaymentDto> {
    seesPayments(actor)
    return this.payments.get(actor, id)
  }

  /** Taking money needs taking payments; handing it out, paying out: the service says which. */
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Body(zod(customerPaymentInputSchema)) input: CustomerPaymentInput,
  ): Promise<CustomerPaymentDto> {
    return this.payments.create(actor, input)
  }

  @Post('opening')
  @Can('customers.adjust')
  opening(
    @CurrentActor() actor: Actor,
    @Body(zod(customerOpeningInputSchema)) input: CustomerOpeningInput,
  ): Promise<CustomerPaymentDto> {
    return this.payments.opening(actor, input)
  }

  @Post('adjust')
  @Can('customers.adjust')
  adjust(
    @CurrentActor() actor: Actor,
    @Body(zod(customerAdjustInputSchema)) input: CustomerAdjustInput,
  ): Promise<CustomerPaymentDto> {
    return this.payments.adjust(actor, input)
  }

  @Post('exchange')
  @Can('customers.adjust')
  exchange(
    @CurrentActor() actor: Actor,
    @Body(zod(customerExchangeInputSchema)) input: CustomerExchangeInput,
  ): Promise<CustomerPaymentDto> {
    return this.payments.exchange(actor, input)
  }

  @Post('transfer')
  @Can('customers.adjust')
  transfer(
    @CurrentActor() actor: Actor,
    @Body(zod(customerTransferInputSchema)) input: CustomerTransferInput,
  ): Promise<CustomerPaymentDto> {
    return this.payments.transfer(actor, input)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(customerPaymentCancelSchema)) input: { reason: string },
  ): Promise<CustomerPaymentDto> {
    return this.payments.cancel(actor, id, input.reason)
  }
}
