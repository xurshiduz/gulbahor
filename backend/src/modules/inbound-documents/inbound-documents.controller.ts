import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { InboundDocumentsService } from './inbound-documents.service';
import { CreateInboundDocumentDto, PrintLabelsDto, UpdateInboundDocumentDto } from './dto/inbound-documents.dto';
import { LabelsService } from './labels/labels.service';

@ApiTags('Inbound documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inbound-documents')
export class InboundDocumentsController {
  constructor(private readonly service: InboundDocumentsService, private readonly labels: LabelsService) {}

  @Get()
  @RequirePermission('read:inbound-documents')
  findAll() { return this.service.findAll(); }

  /** RFID kodi (EPC) bo'yicha tovar */
  @Get('rfid/:epc')
  @RequirePermission('read:inbound-documents')
  findByEpc(@Param('epc') epc: string) { return this.labels.findByEpc(epc); }

  /** Etiketkalar holati: har tovardan nechta kerak, nechtasi chop etilgan, printer sozlangani */
  @Get(':id/labels')
  @RequirePermission('read:inbound-documents')
  labelStatus(@Param('id', ParseUUIDPipe) id: string) { return this.labels.status(id); }

  /** Etiketkalarni RFID printerga yuborish: har dona uchun alohida etiketka va chipga kod */
  @Post(':id/labels/print')
  @RequirePermission('print:inbound-documents')
  printLabels(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrintLabelsDto) { return this.labels.print(id, dto.items, dto); }

  /** Xuddi shu etiketkalar ZPL matni sifatida - printerga qo'lda yuborish uchun */
  @Post(':id/labels/zpl')
  @RequirePermission('print:inbound-documents')
  labelsZpl(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrintLabelsDto) { return this.labels.download(id, dto.items, dto); }

  @Get(':id')
  @RequirePermission('read:inbound-documents')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:inbound-documents')
  create(@Body() dto: CreateInboundDocumentDto, @Req() req: any) { return this.service.create(dto, req.user?.id); }

  @Put(':id')
  @RequirePermission('update:inbound-documents')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInboundDocumentDto) { return this.service.update(id, dto); }

  /** Tasdiqlash - hujjat qulflanadi */
  @Post(':id/approve')
  @RequirePermission('approve:inbound-documents')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.approve(id, req.user?.id); }

  /** Qoralamaga qaytarish */
  @Post(':id/revert')
  @RequirePermission('approve:inbound-documents')
  revert(@Param('id', ParseUUIDPipe) id: string) { return this.service.revert(id); }

  @Delete(':id')
  @RequirePermission('delete:inbound-documents')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
