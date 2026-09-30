import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundDocument } from './entities/outbound-document.entity';
import { OutboundDocumentItem } from './entities/outbound-document-item.entity';
import { InboundDocumentItem } from '../inbound-documents/entities/inbound-document-item.entity';
import { OutboundDocumentsService } from './outbound-documents.service';
import { OutboundDocumentsController } from './outbound-documents.controller';

/**
 * Chiqim (sotuv) hujjatlari. Hozircha jadval va qaytarish uchun qidiruv -
 * hujjat yaratish formasi Chiqim moduli bilan qo'shiladi.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OutboundDocument, OutboundDocumentItem, InboundDocumentItem])],
  providers: [OutboundDocumentsService],
  controllers: [OutboundDocumentsController],
  exports: [OutboundDocumentsService, TypeOrmModule],
})
export class OutboundDocumentsModule {}
