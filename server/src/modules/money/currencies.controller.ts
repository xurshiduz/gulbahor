import {
  currencyCodeSchema,
  currencyInputSchema,
  currencyRateInputSchema,
  type AnyCurrency,
  type CurrenciesDto,
  type CurrencyInput,
  type CurrencyRateDto,
  type CurrencyRateInput,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { CurrenciesService } from './currencies.service'

const code = () => Param('code', zod(currencyCodeSchema))

/**
 * The currencies of a business and their rates. Anyone signed in may read
 * them — a rate is no secret, and nothing here says how much is kept; who
 * runs the money switches currencies on and off, who sets rates sets these.
 */
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  list(@CurrentActor() actor: Actor): Promise<CurrenciesDto> {
    return this.currencies.list(actor)
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
