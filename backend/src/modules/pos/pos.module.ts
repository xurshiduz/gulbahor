import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../materials/entities/material.entity';
import { Contractor } from '../contractors/entities/contractor.entity';
import { Organization } from '../administration/entities/organization.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { PaymentType } from '../accounting/entities/payment-type.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { OutboundDocumentsModule } from '../outbound-documents/outbound-documents.module';
import { StockModule } from '../stock/stock.module';
import { CashModule } from '../cash/cash.module';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';

/** Kassa (POS): chek yopilganda sotuv hujjati va pul tushumi yoziladi */
@Module({
  imports: [
    TypeOrmModule.forFeature([Material, Organization, Contractor, Currency, PaymentType]),
    AccountingModule,
    OutboundDocumentsModule,
    StockModule,
    CashModule,
  ],
  providers: [PosService],
  controllers: [PosController],
})
export class PosModule {}
