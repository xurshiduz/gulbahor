import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { OutboundDocumentsService } from './outbound-documents.service';
import { CreateOutboundDocumentDto, UpdateOutboundDocumentDto } from './dto/outbound-documents.dto';

/** Chiqim (sotuv) hujjatlari va ulardan qaytarish uchun qidiruv (kirim: Qaytarish va Almashinuv) */
@ApiTags('Outbound documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('outbound-documents')
export class OutboundDocumentsController {
  constructor(private readonly service: OutboundDocumentsService) {}

  @Get()
  @RequirePermission('read:outbound-documents')
  findAll() { return this.service.findAll(); }

  /** Mijozning sotuvlari; q - tovar nomi / shtrix-kodi / chek raqami */
  @Get('for-return')
  @RequirePermission('read:inbound-documents', 'read:outbound-documents')
  findForReturn(@Query('contractorId', ParseUUIDPipe) contractorId: string, @Query('q') q?: string) {
    return this.service.findForReturn(contractorId, q);
  }

  /** Chek raqami bo'yicha; exclude - tahrirlanayotgan kirim hujjati (uning soni "qaytarilgan"ga qo'shilmaydi) */
  @Get('by-number/:number')
  @RequirePermission('read:inbound-documents', 'read:outbound-documents')
  findByNumber(@Param('number') number: string, @Query('exclude') exclude?: string) {
    return this.service.findByNumber(number, exclude);
  }

  @Get(':id')
  @RequirePermission('read:outbound-documents')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:outbound-documents')
  create(@Body() dto: CreateOutboundDocumentDto, @Req() req: any) { return this.service.create(dto, req.user?.id); }

  @Put(':id')
  @RequirePermission('update:outbound-documents')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOutboundDocumentDto) { return this.service.update(id, dto); }

  /** Tasdiqlash - hujjat qulflanadi */
  @Post(':id/approve')
  @RequirePermission('approve:outbound-documents')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.approve(id, req.user?.id); }

  /** Qoralamaga qaytarish */
  @Post(':id/revert')
  @RequirePermission('approve:outbound-documents')
  revert(@Param('id', ParseUUIDPipe) id: string) { return this.service.revert(id); }

  @Delete(':id')
  @RequirePermission('delete:outbound-documents')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
