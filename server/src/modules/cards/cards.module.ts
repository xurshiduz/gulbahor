import { Module } from '@nestjs/common'

import { CardNoticesService } from './card-notices.service'
import { CardEntriesController, CardNoticesController, TelegramAccountsController } from './cards.controller'
import { TelegramAccountsService } from './telegram-accounts.service'
import { TelegramGateway } from './telegram.gateway'

/** Card control: the Telegram accounts the banks' notices are read from, and the notices themselves. */
@Module({
  controllers: [CardNoticesController, CardEntriesController, TelegramAccountsController],
  providers: [TelegramGateway, CardNoticesService, TelegramAccountsService],
  exports: [CardNoticesService],
})
export class CardsModule {}
