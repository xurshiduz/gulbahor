import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { OutboundDocumentsService } from './outbound-documents.service';

/** Sotuv hujjatlarini qaytarish uchun qidirish (kirim: Qaytarish va Almashinuv) */
@ApiTags('Outbound documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('outbound-documents')
export class OutboundDocumentsController {
  constructor(private readonly service: OutboundDocumentsService) {}

  /** Mijozning sotuvlari; q - tovar nomi / shtrix-kodi / chek raqami */
  @Get('for-return')
  @RequirePermission('read:inbound-documents')
  findForReturn(@Query('contractorId', ParseUUIDPipe) contractorId: string, @Query('q') q?: string) {
    return this.service.findForReturn(contractorId, q);
  }

  /** Chek raqami bo'yicha; exclude - tahrirlanayotgan kirim hujjati (uning soni "qaytarilgan"ga qo'shilmaydi) */
  @Get('by-number/:number')
  @RequirePermission('read:inbound-documents')
  findByNumber(@Param('number') number: string, @Query('exclude') exclude?: string) {
    return this.service.findByNumber(number, exclude);
  }
}
