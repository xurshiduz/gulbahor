import {
  accountInputSchema,
  idSchema,
  moneyTransferInputSchema,
  moneyTransferListQuerySchema,
  moneyTransferRejectSchema,
  registerInputSchema,
  shiftCloseSchema,
  shiftListQuerySchema,
  shiftOpenSchema,
  type AccountDto,
  type AccountInput,
  type MoneyTransferDto,
  type MoneyTransferInput,
  type MoneyTransferListQuery,
  type Page,
  type RegisterDto,
  type RegisterInput,
  type ShiftCloseInput,
  type ShiftDto,
  type ShiftListQuery,
  type ShiftOpenInput,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { MoneyService } from './money.service'
import { ShiftsService } from './shifts.service'
import { MoneyTransfersService } from './transfers.service'

const id = () => Param('id', zod(idSchema))

@Controller('money')
export class MoneyController {
  constructor(private readonly money: MoneyService) {}

  /** The tills of the shops a person works in: the till screen and the settings both start from these. */
  @Get('registers')
  registers(@CurrentActor() actor: Actor): Promise<RegisterDto[]> {
    return this.money.registers(actor)
  }

  @Post('registers')
  @Can('money.manage')
  createRegister(
    @CurrentActor() actor: Actor,
    @Body(zod(registerInputSchema)) input: RegisterInput,
  ): Promise<RegisterDto> {
    return this.money.createRegister(actor, input)
  }

  @Put('registers/:id')
  @Can('money.manage')
  updateRegister(
    @CurrentActor() actor: Actor,
    @id() registerId: string,
    @Body(zod(registerInputSchema)) input: RegisterInput,
  ): Promise<RegisterDto> {
    return this.money.updateRegister(actor, registerId, input)
  }

  /** Makes it the shop's main till. */
  @Post('registers/:id/main')
  @HttpCode(200)
  @Can('money.manage')
  mainRegister(@CurrentActor() actor: Actor, @id() registerId: string): Promise<RegisterDto> {
    return this.money.setMainRegister(actor, registerId)
  }

  @Post('registers/:id/archive')
  @HttpCode(200)
  @Can('money.manage')
  archiveRegister(@CurrentActor() actor: Actor, @id() registerId: string): Promise<RegisterDto> {
    return this.money.setRegisterActive(actor, registerId, false)
  }

  @Post('registers/:id/restore')
  @HttpCode(200)
  @Can('money.manage')
  restoreRegister(@CurrentActor() actor: Actor, @id() registerId: string): Promise<RegisterDto> {
    return this.money.setRegisterActive(actor, registerId, true)
  }

  /** Balances are shown to those who may see them; those who only set accounts up see the list without. */
  @Get('accounts')
  accounts(@CurrentActor() actor: Actor): Promise<AccountDto[]> {
    if (!can(actor, 'money.view') && !can(actor, 'money.manage') && !can(actor, 'money.collect')) {
      throw AppError.forbidden()
    }
    return this.money.accounts(actor)
  }

  @Post('accounts')
  @Can('money.manage')
  createAccount(@CurrentActor() actor: Actor, @Body(zod(accountInputSchema)) input: AccountInput): Promise<AccountDto> {
    return this.money.createAccount(actor, input)
  }

  @Put('accounts/:id')
  @Can('money.manage')
  updateAccount(
    @CurrentActor() actor: Actor,
    @id() accountId: string,
    @Body(zod(accountInputSchema)) input: AccountInput,
  ): Promise<AccountDto> {
    return this.money.updateAccount(actor, accountId, input)
  }

  @Post('accounts/:id/archive')
  @HttpCode(200)
  @Can('money.manage')
  archiveAccount(@CurrentActor() actor: Actor, @id() accountId: string): Promise<AccountDto> {
    return this.money.setAccountActive(actor, accountId, false)
  }

  @Post('accounts/:id/restore')
  @HttpCode(200)
  @Can('money.manage')
  restoreAccount(@CurrentActor() actor: Actor, @id() accountId: string): Promise<AccountDto> {
    return this.money.setAccountActive(actor, accountId, true)
  }
}

/**
 * Money moved between accounts. Who may send and who may confirm depends on
 * the accounts, so it is the service that decides; the list is for those who
 * look after the business's money.
 */
@Controller('money/transfers')
export class MoneyTransfersController {
  constructor(private readonly transfers: MoneyTransfersService) {}

  @Get()
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(moneyTransferListQuerySchema)) query: MoneyTransferListQuery,
  ): Promise<Page<MoneyTransferDto>> {
    if (!can(actor, 'money.view') && !can(actor, 'money.collect') && !can(actor, 'money.manage')) {
      throw AppError.forbidden()
    }
    return this.transfers.list(actor, query)
  }

  @Post()
  send(
    @CurrentActor() actor: Actor,
    @Body(zod(moneyTransferInputSchema)) input: MoneyTransferInput,
  ): Promise<MoneyTransferDto> {
    return this.transfers.send(actor, input)
  }

  @Post(':id/receive')
  @HttpCode(200)
  receive(@CurrentActor() actor: Actor, @id() transferId: string): Promise<MoneyTransferDto> {
    return this.transfers.receive(actor, transferId)
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentActor() actor: Actor,
    @id() transferId: string,
    @Body(zod(moneyTransferRejectSchema)) input: { reason: string },
  ): Promise<MoneyTransferDto> {
    return this.transfers.reject(actor, transferId, input.reason)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentActor() actor: Actor, @id() transferId: string): Promise<MoneyTransferDto> {
    return this.transfers.cancel(actor, transferId)
  }
}

/** Who may look at shifts at all: the cashiers who work them and those who check them. */
function seesShifts(actor: Actor) {
  if (!can(actor, 'pos.sell') && !can(actor, 'sales.shifts')) {
    throw AppError.forbidden()
  }
}

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query(zod(shiftListQuerySchema)) query: ShiftListQuery): Promise<Page<ShiftDto>> {
    seesShifts(actor)
    return this.shifts.list(actor, query)
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() shiftId: string): Promise<ShiftDto> {
    seesShifts(actor)
    return this.shifts.get(actor, shiftId)
  }

  @Post()
  @Can('pos.sell')
  open(@CurrentActor() actor: Actor, @Body(zod(shiftOpenSchema)) input: ShiftOpenInput): Promise<ShiftDto> {
    return this.shifts.open(actor, input)
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @CurrentActor() actor: Actor,
    @id() shiftId: string,
    @Body(zod(shiftCloseSchema)) input: ShiftCloseInput,
  ): Promise<ShiftDto> {
    seesShifts(actor)
    return this.shifts.close(actor, shiftId, input)
  }
}
