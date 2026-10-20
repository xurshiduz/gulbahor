import {
  cardEntryCheckSchema,
  cardEntryListQuerySchema,
  cardNoticeDismissSchema,
  cardNoticeListQuerySchema,
  cardNoticeMatchSchema,
  cardNoticePasteSchema,
  cardPickQuerySchema,
  idSchema,
  telegramLoginCodeSchema,
  telegramLoginPasswordSchema,
  telegramLoginQrSchema,
  telegramLoginResendSchema,
  telegramLoginStartSchema,
  type CardEntryCheckInput,
  type CardEntryDto,
  type CardNoticeDismissInput,
  type CardNoticeDto,
  type CardNoticeListQuery,
  type CardNoticeMatchInput,
  type CardNoticePasteInput,
  type CardNoticeSummary,
  type CardPickDto,
  type CardStandDto,
  type Page,
  type TelegramAccountDto,
  type TelegramLoginCodeInput,
  type TelegramLoginPasswordInput,
  type TelegramLoginQrInput,
  type TelegramLoginReady,
  type TelegramLoginResendInput,
  type TelegramLoginStartInput,
  type TelegramLoginStep,
  type TelegramSetupDto,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { z } from 'zod'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor, RequireModule } from '../auth/actor'
import { CardNoticesService } from './card-notices.service'
import { TelegramAccountsService } from './telegram-accounts.service'

const id = () => Param('id', zod(idSchema))

/** What the banks' bots wrote about the business's cards. */
@Controller('card-notices')
@RequireModule('cards')
export class CardNoticesController {
  constructor(private readonly notices: CardNoticesService) {}

  @Get()
  @Can('cards.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(cardNoticeListQuerySchema)) query: CardNoticeListQuery,
  ): Promise<Page<CardNoticeDto> & { summary: CardNoticeSummary }> {
    return this.notices.list(actor, query)
  }

  /** What a payment window offers beside a card's line; whoever writes card money may ask, the service says who. */
  @Get('picks')
  picks(
    @CurrentActor() actor: Actor,
    @Query(zod(cardPickQuerySchema)) query: z.infer<typeof cardPickQuerySchema>,
  ): Promise<CardPickDto[]> {
    return this.notices.picks(actor, query.direction)
  }

  @Get('stand')
  @Can('cards.view')
  stand(@CurrentActor() actor: Actor): Promise<CardStandDto[]> {
    return this.notices.stand(actor)
  }

  /** A bot's message pasted in by hand: for a notice the reader did not see, and for trying the reader out. */
  @Post()
  @Can('cards.manage')
  paste(
    @CurrentActor() actor: Actor,
    @Body(zod(cardNoticePasteSchema)) input: CardNoticePasteInput,
  ): Promise<CardNoticeDto> {
    return this.notices.paste(actor, input)
  }

  @Get(':id/candidates')
  @Can('cards.settle')
  candidates(@CurrentActor() actor: Actor, @id() noticeId: string): Promise<CardEntryDto[]> {
    return this.notices.candidates(actor, noticeId)
  }

  @Post(':id/match')
  @HttpCode(200)
  @Can('cards.settle')
  match(
    @CurrentActor() actor: Actor,
    @id() noticeId: string,
    @Body(zod(cardNoticeMatchSchema)) input: CardNoticeMatchInput,
  ): Promise<CardNoticeDto> {
    return this.notices.match(actor, noticeId, input)
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  @Can('cards.settle')
  dismiss(
    @CurrentActor() actor: Actor,
    @id() noticeId: string,
    @Body(zod(cardNoticeDismissSchema)) input: CardNoticeDismissInput,
  ): Promise<CardNoticeDto> {
    return this.notices.dismiss(actor, noticeId, input.reason)
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @Can('cards.settle')
  reopen(@CurrentActor() actor: Actor, @id() noticeId: string): Promise<CardNoticeDto> {
    return this.notices.reopen(actor, noticeId)
  }
}

/** Money the books say moved through a card that no bank notice stands for. */
@Controller('card-entries')
@RequireModule('cards')
export class CardEntriesController {
  constructor(private readonly notices: CardNoticesService) {}

  @Get()
  @Can('cards.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(cardEntryListQuerySchema)) query: z.infer<typeof cardEntryListQuerySchema>,
  ): Promise<CardEntryDto[]> {
    return this.notices.entries(actor, query.accountId)
  }

  /** Looked at and found right: the bank's own app shows the money, only its notice is missing. */
  @Post('check')
  @HttpCode(200)
  @Can('cards.settle')
  check(@CurrentActor() actor: Actor, @Body(zod(cardEntryCheckSchema)) input: CardEntryCheckInput): Promise<void> {
    return this.notices.check(actor, input, true)
  }

  @Post('uncheck')
  @HttpCode(200)
  @Can('cards.settle')
  uncheck(@CurrentActor() actor: Actor, @Body(zod(cardEntryCheckSchema)) input: CardEntryCheckInput): Promise<void> {
    return this.notices.check(actor, input, false)
  }
}

/** The Telegram accounts the notices are read from: signing one in, looking at it, switching it off. */
@Controller('telegram-accounts')
@RequireModule('cards')
@Can('cards.manage')
export class TelegramAccountsController {
  constructor(private readonly accounts: TelegramAccountsService) {}

  @Get()
  setup(@CurrentActor() actor: Actor): Promise<TelegramSetupDto> {
    return this.accounts.setup(actor)
  }

  @Post('login/qr')
  @HttpCode(200)
  qr(
    @CurrentActor() actor: Actor,
    @Body(zod(telegramLoginQrSchema)) input: TelegramLoginQrInput,
  ): Promise<TelegramLoginStep> {
    return this.accounts.qr(actor, input)
  }

  @Post('login/prepare')
  @HttpCode(200)
  prepare(@CurrentActor() actor: Actor): Promise<TelegramLoginReady> {
    return this.accounts.prepare(actor)
  }

  @Post('login/cancel')
  @HttpCode(200)
  async abandon(
    @CurrentActor() actor: Actor,
    @Body(zod(telegramLoginResendSchema)) input: TelegramLoginResendInput,
  ): Promise<{ ok: true }> {
    await this.accounts.abandon(actor, input.loginId)
    return { ok: true }
  }

  @Post('login')
  @HttpCode(200)
  start(
    @CurrentActor() actor: Actor,
    @Body(zod(telegramLoginStartSchema)) input: TelegramLoginStartInput,
  ): Promise<TelegramLoginStep> {
    return this.accounts.start(actor, input)
  }

  @Post('login/code')
  @HttpCode(200)
  code(
    @CurrentActor() actor: Actor,
    @Body(zod(telegramLoginCodeSchema)) input: TelegramLoginCodeInput,
  ): Promise<TelegramLoginStep> {
    return this.accounts.code(actor, input)
  }

  @Post('login/resend')
  @HttpCode(200)
  resend(
    @CurrentActor() actor: Actor,
    @Body(zod(telegramLoginResendSchema)) input: TelegramLoginResendInput,
  ): Promise<TelegramLoginStep> {
    return this.accounts.resend(actor, input)
  }

  @Post('login/password')
  @HttpCode(200)
  password(
    @CurrentActor() actor: Actor,
    @Body(zod(telegramLoginPasswordSchema)) input: TelegramLoginPasswordInput,
  ): Promise<TelegramLoginStep> {
    return this.accounts.password(actor, input)
  }

  @Post(':id/reconnect')
  @HttpCode(200)
  reconnect(@CurrentActor() actor: Actor, @id() accountId: string): Promise<TelegramAccountDto> {
    return this.accounts.reconnect(actor, accountId)
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentActor() actor: Actor, @id() accountId: string): Promise<TelegramAccountDto> {
    return this.accounts.readNow(actor, accountId)
  }

  @Post(':id/off')
  @HttpCode(200)
  off(@CurrentActor() actor: Actor, @id() accountId: string): Promise<TelegramAccountDto> {
    return this.accounts.switchOff(actor, accountId)
  }
}
