import {
  debtListQuerySchema,
  debtPaymentCancelSchema,
  debtPaymentInputSchema,
  debtPaymentListQuerySchema,
  idSchema,
  type CustomerDebtDto,
  type DebtListQuery,
  type DebtPaymentDto,
  type DebtPaymentInput,
  type DebtPaymentListQuery,
  type DebtSummary,
  type Page,
  type PaymentAccountDto,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { CustomerDebtsService } from './debts.service'

/** A debt is paid to whoever keeps the debts, or to a cashier at the till. */
function takesPayments(actor: Actor): void {
  if (!can(actor, 'customers.debts') && !can(actor, 'pos.sell')) {
    throw AppError.forbidden()
  }
}

@Controller('customer-debts')
export class CustomerDebtsController {
  constructor(private readonly debts: CustomerDebtsService) {}

  @Get()
  @Can('customers.debts')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(debtListQuerySchema)) query: DebtListQuery,
  ): Promise<Page<CustomerDebtDto> & { summary: DebtSummary }> {
    return this.debts.list(actor, query)
  }

  @Get('accounts')
  accounts(@CurrentActor() actor: Actor): Promise<PaymentAccountDto[]> {
    takesPayments(actor)
    return this.debts.accounts(actor)
  }

  @Get('payments')
  @Can('customers.debts')
  payments(
    @CurrentActor() actor: Actor,
    @Query(zod(debtPaymentListQuerySchema)) query: DebtPaymentListQuery,
  ): Promise<Page<DebtPaymentDto>> {
    return this.debts.payments(actor, query)
  }

  @Post('payments')
  @HttpCode(200)
  pay(
    @CurrentActor() actor: Actor,
    @Body(zod(debtPaymentInputSchema)) input: DebtPaymentInput,
  ): Promise<DebtPaymentDto> {
    takesPayments(actor)
    return this.debts.pay(actor, input)
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  @Can('customers.debts')
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', zod(idSchema)) id: string,
    @Body(zod(debtPaymentCancelSchema)) input: { reason: string | null },
  ): Promise<DebtPaymentDto> {
    return this.debts.cancel(actor, id, input.reason)
  }
}
