import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { User } from '../users/entities/user.entity';
import { OrganizationsService } from './services/organizations.service';
import { BranchesService } from './services/branches.service';
import { WarehousesService } from './services/warehouses.service';
import { OrganizationsController } from './controllers/organizations.controller';
import { BranchesController } from './controllers/branches.controller';
import { WarehousesController } from './controllers/warehouses.controller';

/** Ma'muriyat: tashkilotlar (rekvizitlar), filiallar, omborxonalar */
@Module({
  imports: [TypeOrmModule.forFeature([Organization, Branch, Warehouse, User])],
  providers: [OrganizationsService, BranchesService, WarehousesService],
  controllers: [OrganizationsController, BranchesController, WarehousesController],
  exports: [OrganizationsService, BranchesService, WarehousesService],
})
export class AdministrationModule {}
