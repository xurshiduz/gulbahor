import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transfer } from './entities/transfer.entity';
import { TransferItem } from './entities/transfer-item.entity';
import { TransferTag } from './entities/transfer-tag.entity';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { RfidTag } from '../inbound-documents/entities/rfid-tag.entity';
import { StockModule } from '../stock/stock.module';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';

/** Ko'chirish: filial / omborlar orasida, yuborish va qabul qilish */
@Module({
  imports: [TypeOrmModule.forFeature([Transfer, TransferItem, TransferTag, Branch, Warehouse, Material, RfidTag]), StockModule],
  providers: [TransfersService],
  controllers: [TransfersController],
})
export class TransfersModule {}
