import {
  baseCurrencyInputSchema,
  currencyCodeSchema,
  currencyInputSchema,
  currencyRateInputSchema,
  type AnyCurrency,
  type BaseCurrencyDto,
  type BaseCurrencyInput,
  type CostCurrencyDto,
  type CurrenciesDto,
  type CurrencyInput,
  type CurrencyRateDto,
  type CurrencyRateInput,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { BaseCurrencyService } from './base-currency.service'
import { CurrenciesService } from './currencies.service'

const code = () => Param('code', zod(currencyCodeSchema))

/**
 * The currencies of a business and their rates. Anyone signed in may read
 * them — a rate is no secret, and nothing here says how much is kept; who
 * runs the money switches currencies on and off, who sets rates sets these.
 */
@Controller('currencies')
export class CurrenciesController {
  constructor(
    private readonly currencies: CurrenciesService,
    private readonly bases: BaseCurrencyService,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<CurrenciesDto> {
    return this.currencies.list(actor)
  }

  /** The base, and whether it may still change: until the first money is written. */
  @Get('base')
  base(@CurrentActor() actor: Actor): Promise<BaseCurrencyDto> {
    return this.bases.state(actor)
  }

  @Put('base')
  @Can('settings.manage')
  setBase(
    @CurrentActor() actor: Actor,
    @Body(zod(baseCurrencyInputSchema)) input: BaseCurrencyInput,
  ): Promise<BaseCurrencyDto> {
    return this.bases.change(actor, input.currency)
  }

  /** The currency costs are kept in beside the base, and whether it may still change: until goods are costed. */
  @Get('cost')
  cost(@CurrentActor() actor: Actor): Promise<CostCurrencyDto> {
    return this.bases.costState(actor)
  }

  @Put('cost')
  @Can('settings.manage')
  setCost(
    @CurrentActor() actor: Actor,
    @Body(zod(baseCurrencyInputSchema)) input: BaseCurrencyInput,
  ): Promise<CostCurrencyDto> {
    return this.bases.changeCost(actor, input.currency)
  }

  @Post()
  @HttpCode(200)
  @Can('money.manage')
  enable(@CurrentActor() actor: Actor, @Body(zod(currencyInputSchema)) input: CurrencyInput): Promise<CurrenciesDto> {
    return this.currencies.enable(actor, input.code, input.form)
  }

  @Post(':code/archive')
  @HttpCode(200)
  @Can('money.manage')
  disable(@CurrentActor() actor: Actor, @code() currency: AnyCurrency): Promise<CurrenciesDto> {
    return this.currencies.disable(actor, currency)
  }

  @Get(':code/rates')
  history(@CurrentActor() actor: Actor, @code() currency: AnyCurrency): Promise<CurrencyRateDto[]> {
    return this.currencies.history(actor, currency)
  }

  @Put(':code/rate')
  @Can('money.rates')
  setRate(
    @CurrentActor() actor: Actor,
    @code() currency: AnyCurrency,
    @Body(zod(currencyRateInputSchema)) input: CurrencyRateInput,
  ): Promise<CurrenciesDto> {
    return this.currencies.setRate(actor, currency, input)
  }
}
