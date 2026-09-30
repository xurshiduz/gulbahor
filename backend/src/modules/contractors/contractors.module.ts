import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contractor } from './entities/contractor.entity';
import { Country } from '../references/entities/country.entity';
import { Region } from '../references/entities/region.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { CustomersService, SuppliersService } from './services/contractors.service';
import { CustomersController } from './controllers/customers.controller';
import { SuppliersController } from './controllers/suppliers.controller';

/** Kontragentlar: mijozlar va yetkazib beruvchilar (mahalliy / import) */
@Module({
  imports: [TypeOrmModule.forFeature([Contractor, Country, Region, Currency])],
  providers: [CustomersService, SuppliersService],
  controllers: [CustomersController, SuppliersController],
  exports: [CustomersService, SuppliersService],
})
export class ContractorsModule {}
