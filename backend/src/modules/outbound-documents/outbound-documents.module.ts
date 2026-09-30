import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundDocument } from './entities/outbound-document.entity';
import { OutboundDocumentItem } from './entities/outbound-document-item.entity';
import { InboundDocumentItem } from '../inbound-documents/entities/inbound-document-item.entity';
import { Contractor } from '../contractors/entities/contractor.entity';
import { Warehouse } from '../administration/entities/warehouse.entity';
import { Material } from '../materials/entities/material.entity';
import { OutboundDocumentsService } from './outbound-documents.service';
import { OutboundDocumentsController } from './outbound-documents.controller';

/** Chiqim (sotuv) hujjatlari: barcha sotuvlar va ulardan qaytarish uchun qidiruv */
@Module({
  imports: [TypeOrmModule.forFeature([OutboundDocument, OutboundDocumentItem, InboundDocumentItem, Contractor, Warehouse, Material])],
  providers: [OutboundDocumentsService],
  controllers: [OutboundDocumentsController],
  exports: [OutboundDocumentsService, TypeOrmModule],
})
export class OutboundDocumentsModule {}
