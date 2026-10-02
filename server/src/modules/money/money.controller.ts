import {
  accountInputSchema,
  idSchema,
  rateInputSchema,
  registerInputSchema,
  shiftCloseSchema,
  shiftListQuerySchema,
  shiftOpenSchema,
  type AccountDto,
  type AccountInput,
  type Page,
  type RateDto,
  type RateInput,
  type RegisterDto,
  type RegisterInput,
  type ShiftCloseInput,
  type ShiftDto,
  type ShiftListQuery,
  type ShiftOpenInput,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { MoneyService } from './money.service'
import { ShiftsService } from './shifts.service'

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
    if (!can(actor, 'money.view') && !can(actor, 'money.manage')) {
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

  @Get('rates')
  rates(@CurrentActor() actor: Actor): Promise<{ current: RateDto | null; history: RateDto[] }> {
    return this.money.rates(actor)
  }

  @Put('rates')
  @Can('money.rates')
  setRate(@CurrentActor() actor: Actor, @Body(zod(rateInputSchema)) input: RateInput): Promise<RateDto> {
    return this.money.setRate(actor, input)
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
