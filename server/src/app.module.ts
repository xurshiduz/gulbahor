import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { validateEnv } from './config/env'
import { DatabaseModule } from './database/database.module'
import { AuditModule } from './modules/audit/audit.module'
import { AuthModule } from './modules/auth/auth.module'
import { CatalogModule } from './modules/catalog/catalog.module'
import { FilesModule } from './modules/files/files.module'
import { LabelsModule } from './modules/labels/labels.module'
import { LocationsModule } from './modules/locations/locations.module'
import { MoneyModule } from './modules/money/money.module'
import { OrgsModule } from './modules/orgs/orgs.module'
import { CustomersModule } from './modules/customers/customers.module'
import { PartnersModule } from './modules/partners/partners.module'
import { PosModule } from './modules/pos/pos.module'
import { PricingModule } from './modules/pricing/pricing.module'
import { PromotionsModule } from './modules/promotions/promotions.module'
import { ReportsModule } from './modules/reports/reports.module'
import { ReceiptsModule } from './modules/receipts/receipts.module'
import { RealtimeGatewayModule } from './modules/realtime/realtime.gateway'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { RolesModule } from './modules/roles/roles.module'
import { StockModule } from './modules/stock/stock.module'
import { StockDocsModule } from './modules/stockdocs/stockdocs.module'
import { UsersModule } from './modules/users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'], validate: validateEnv }),
    // A ceiling against runaway clients; sign-in has its own, much lower, limit.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 600 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    DatabaseModule,
    RealtimeModule,
    AuditModule,
    FilesModule,
    AuthModule,
    RealtimeGatewayModule,
    OrgsModule,
    LocationsModule,
    RolesModule,
    UsersModule,
    CatalogModule,
    PartnersModule,
    CustomersModule,
    PromotionsModule,
    ReportsModule,
    StockModule,
    ReceiptsModule,
    StockDocsModule,
    LabelsModule,
    PricingModule,
    MoneyModule,
    PosModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
