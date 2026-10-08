import {
  idSchema,
  moneyCategoryInputSchema,
  moneyOpCancelSchema,
  moneyOpInputSchema,
  moneyOpListQuerySchema,
  type MoneyCategoryDto,
  type MoneyCategoryInput,
  type MoneyOpDto,
  type MoneyOpInput,
  type MoneyOpListQuery,
  type MoneyOpSums,
  type Page,
  type PaymentAccountDto,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { MoneyOpsService } from './ops.service'

const id = () => Param('id', zod(idSchema))

/** The list is for those who keep the books, and for those who write expenses: these see their own. */
function seesOps(actor: Actor) {
  if (!can(actor, 'money.view') && !can(actor, 'money.ops')) {
    throw AppError.forbidden()
  }
}

@Controller('money')
export class MoneyOpsController {
  constructor(private readonly ops: MoneyOpsService) {}

  /** Whoever may write an expense has to be able to say what it was for. */
  @Get('categories')
  categories(@CurrentActor() actor: Actor): Promise<MoneyCategoryDto[]> {
    if (!can(actor, 'money.categories')) {
      seesOps(actor)
    }
    return this.ops.categories(actor)
  }

  @Post('categories')
  @Can('money.categories')
  createCategory(
    @CurrentActor() actor: Actor,
    @Body(zod(moneyCategoryInputSchema)) input: MoneyCategoryInput,
  ): Promise<MoneyCategoryDto> {
    return this.ops.createCategory(actor, input)
  }

  @Put('categories/:id')
  @Can('money.categories')
  updateCategory(
    @CurrentActor() actor: Actor,
    @id() categoryId: string,
    @Body(zod(moneyCategoryInputSchema)) input: MoneyCategoryInput,
  ): Promise<MoneyCategoryDto> {
    return this.ops.updateCategory(actor, categoryId, input)
  }

  @Post('categories/:id/archive')
  @HttpCode(200)
  @Can('money.categories')
  archiveCategory(@CurrentActor() actor: Actor, @id() categoryId: string): Promise<MoneyCategoryDto> {
    return this.ops.setCategoryActive(actor, categoryId, false)
  }

  @Post('categories/:id/restore')
  @HttpCode(200)
  @Can('money.categories')
  restoreCategory(@CurrentActor() actor: Actor, @id() categoryId: string): Promise<MoneyCategoryDto> {
    return this.ops.setCategoryActive(actor, categoryId, true)
  }

  @Get('ops/accounts')
  @Can('money.ops')
  accounts(@CurrentActor() actor: Actor): Promise<PaymentAccountDto[]> {
    return this.ops.accounts(actor)
  }

  @Get('ops')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(moneyOpListQuerySchema)) query: MoneyOpListQuery,
  ): Promise<Page<MoneyOpDto> & { sums: MoneyOpSums }> {
    seesOps(actor)
    return this.ops.list(actor, query)
  }

  @Get('ops/:id')
  get(@CurrentActor() actor: Actor, @id() opId: string): Promise<MoneyOpDto> {
    seesOps(actor)
    return this.ops.get(actor, opId)
  }

  @Post('ops')
  @Can('money.ops')
  create(@CurrentActor() actor: Actor, @Body(zod(moneyOpInputSchema)) input: MoneyOpInput): Promise<MoneyOpDto> {
    return this.ops.create(actor, input)
  }

  @Post('ops/:id/cancel')
  @HttpCode(200)
  @Can('money.ops')
  cancel(
    @CurrentActor() actor: Actor,
    @id() opId: string,
    @Body(zod(moneyOpCancelSchema)) input: { reason: string },
  ): Promise<MoneyOpDto> {
    return this.ops.cancel(actor, opId, input.reason)
  }
}
