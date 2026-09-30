import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundDocument } from './entities/inbound-document.entity';
import { InboundDocumentItem } from './entities/inbound-document-item.entity';
import { Contractor } from '../contractors/entities/contractor.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Currency } from '../accounting/entities/currency.entity';
import { Material } from '../materials/entities/material.entity';
import { OutboundDocumentsModule } from '../outbound-documents/outbound-documents.module';
import { InboundDocumentsService } from './inbound-documents.service';
import { RfidTag } from './entities/rfid-tag.entity';
import { LabelsService } from './labels/labels.service';
import { InboundDocumentsController } from './inbound-documents.controller';

/** Kirim hujjatlari: xarid, qaytarish, almashinuv */
@Module({
  imports: [
    TypeOrmModule.forFeature([InboundDocument, InboundDocumentItem, RfidTag, Contractor, Warehouse, Currency, Material]),
    // Qaytarish va almashinuv sotuv hujjatlariga tayanadi
    OutboundDocumentsModule,
  ],
  providers: [InboundDocumentsService, LabelsService],
  controllers: [InboundDocumentsController],
  exports: [InboundDocumentsService, LabelsService],
})
export class InboundDocumentsModule {}
