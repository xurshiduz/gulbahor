import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { PaymentsService } from '../services/payments.service';
import { PaymentDto } from '../dto/accounting.dto';
import { PaymentDirection } from '../entities/payment.entity';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  /** direction: EXPENSE - harajatlar (sukut bo'yicha), INCOME - pul tushumlari */
  @Get()
  @RequirePermission('read:payments')
  findAll(@Query('direction') direction?: string) {
    return this.service.findAll(direction === PaymentDirection.INCOME ? PaymentDirection.INCOME : PaymentDirection.EXPENSE);
  }

  /** Sanadagi amaldagi kurs - formada kurs maydonini to'ldirish uchun */
  @Get('rate')
  @RequirePermission('read:payments')
  rate(@Query('currencyId', ParseUUIDPipe) currencyId: string, @Query('date') date?: string) { return this.service.rateFor(currencyId, date); }

  /** Forma uchun tanlovlar: harajat turlari, valyutalar, kontragentlar, kirim va chiqim hujjatlari */
  @Get('options')
  @RequirePermission('read:payments')
  options(@Req() req: any) { return this.service.options(req.user); }

  @Get(':id')
  @RequirePermission('read:payments')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:payments')
  create(@Body() dto: PaymentDto, @Req() req: any) { return this.service.create(dto, req.user); }

  @Put(':id')
  @RequirePermission('update:payments')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto, @Req() req: any) { return this.service.update(id, dto, req.user); }

  @Delete(':id')
  @RequirePermission('delete:payments')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
