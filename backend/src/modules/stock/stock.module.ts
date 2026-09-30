import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

/** Ombor qoldig'i - tasdiqlangan kirim va chiqim hujjatlaridan hisoblanadi */
@Module({
  imports: [TypeOrmModule.forFeature([Branch, Warehouse, Material])],
  providers: [StockService],
  controllers: [StockController],
  exports: [StockService],
})
export class StockModule {}
