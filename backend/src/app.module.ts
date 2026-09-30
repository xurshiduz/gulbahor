import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ReferencesModule } from './modules/references/references.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { ContractorsModule } from './modules/contractors/contractors.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { OutboundDocumentsModule } from './modules/outbound-documents/outbound-documents.module';
import { InboundDocumentsModule } from './modules/inbound-documents/inbound-documents.module';
import { StockModule } from './modules/stock/stock.module';
import { CashModule } from './modules/cash/cash.module';
import { PosModule } from './modules/pos/pos.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        ({
          type: configService.get('DB_TYPE') || 'postgres',
          host: configService.get('DB_HOST'),
          port: parseInt(configService.get('DB_PORT')),
          username: configService.get('DB_USERNAME'),
          password: configService.get('DB_PASSWORD') || '',
          database: configService.get('DB_DATABASE'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: false,
        }) as TypeOrmModuleOptions,
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    ReferencesModule,
    AdministrationModule,
    AccountingModule,
    ContractorsModule,
    MaterialsModule,
    MarketingModule,
    OutboundDocumentsModule,
    InboundDocumentsModule,
    StockModule,
    CashModule,
    PosModule,
    IntegrationsModule,
    InventoryModule,
    ReportsModule,
  ],
  providers: [AppService],
})
export class AppModule {}
