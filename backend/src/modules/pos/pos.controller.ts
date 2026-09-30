import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { PosService } from './pos.service';
import { PosCustomerDto, PosSaleDto } from './dto/pos.dto';

@ApiTags('POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pos')
export class PosController {
  constructor(private readonly service: PosService) {}

  /** Kassalar, valyutalar, to'lov turlari va do'kon nomi */
  @Get('setup')
  @RequirePermission('read:pos')
  setup(@Req() req: any) { return this.service.setup(req.user); }

  /** Tovarlar: narxi va kassa omboridagi qoldig'i bilan */
  @Get('catalog')
  @RequirePermission('read:pos')
  catalog(@Query('cashRegisterId') cashRegisterId: string, @Req() req: any) { return this.service.catalog(cashRegisterId, req.user); }

  /** Skanerlangan shtrix-kod yoki artikul bo'yicha bitta tovar */
  @Get('scan')
  @RequirePermission('read:pos')
  scan(@Query('code') code: string, @Query('cashRegisterId') cashRegisterId: string, @Req() req: any) { return this.service.scan(code, cashRegisterId, req.user); }

  /** Kassada yangi mijoz (F.I.O, telefon, tug'ilgan kun). Shu raqamli mijoz bor bo'lsa - o'sha qaytadi */
  @Post('customers')
  @RequirePermission('sell:pos')
  addCustomer(@Body() dto: PosCustomerDto) { return this.service.addCustomer(dto); }

  /** Chekni yopish: sotuv hujjati + pul tushumi */
  @Post('sales')
  @RequirePermission('sell:pos')
  sell(@Body() dto: PosSaleDto, @Req() req: any) { return this.service.sell(dto, req.user); }
}
