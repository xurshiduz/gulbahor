import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { PaymentsService } from '../services/payments.service';
import { PaymentDto } from '../dto/accounting.dto';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @RequirePermission('read:payments')
  findAll() { return this.service.findAll(); }

  /** Sanadagi amaldagi kurs - formada kurs maydonini to'ldirish uchun */
  @Get('rate')
  @RequirePermission('read:payments')
  rate(@Query('currencyId', ParseUUIDPipe) currencyId: string, @Query('date') date?: string) { return this.service.rateFor(currencyId, date); }

  /** Forma uchun tanlovlar: harajat turlari, valyutalar, kontragentlar, kirim hujjatlari */
  @Get('options')
  @RequirePermission('read:payments')
  options() { return this.service.options(); }

  @Get(':id')
  @RequirePermission('read:payments')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:payments')
  create(@Body() dto: PaymentDto, @Req() req: any) { return this.service.create(dto, req.user?.id); }

  @Put(':id')
  @RequirePermission('update:payments')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:payments')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
