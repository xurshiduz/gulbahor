import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationLog, IntegrationSetting, IntegrationTransaction } from './integration.entity';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { CashModule } from '../cash/cash.module';
import { StockModule } from '../stock/stock.module';
import { IntegrationsService } from './integrations.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { MarketplaceSyncService } from './marketplace-sync.service';
import { IntegrationsController } from './integrations.controller';

/** To'lov integratsiyalari (Payme, Click Pass, UDS, terminallar) va marketpleyslarga qoldiq */
@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationSetting, IntegrationTransaction, IntegrationLog, PaymentType, Warehouse, Material]),
    CashModule,
    StockModule,
  ],
  providers: [IntegrationsService, PaymentGatewayService, MarketplaceSyncService],
  controllers: [IntegrationsController],
  exports: [IntegrationsService, PaymentGatewayService],
})
export class IntegrationsModule {}
