import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryCount } from './entities/inventory-count.entity';
import { InventoryScan } from './entities/inventory-scan.entity';
import { InventoryCountItem } from './entities/inventory-count-item.entity';
import { Branch } from '../administration/entities/branch.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { User } from '../users/entities/user.entity';
import { RfidTag } from '../inbound-documents/entities/rfid-tag.entity';
import { StockModule } from '../stock/stock.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

/** Inventarizatsiya: RFID skaner / shtrix-kod bilan sanash va kamomad-ortiqcha hisoboti */
@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryCount, InventoryScan, InventoryCountItem, Branch, Warehouse, Material, User, RfidTag]),
    StockModule,
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
})
export class InventoryModule {}
