import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { ProductCategory } from '../references/entities/product-category.entity';
import { Material } from '../materials/entities/material.entity';
import { User } from '../users/entities/user.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

/** Hisobotlar: rahbar hisoboti (savdo, foyda, harajat) */
@Module({
  imports: [TypeOrmModule.forFeature([Branch, Warehouse, ProductCategory, Material, User])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
