import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { CashRegistersService } from './cash-registers.service';
import { CashBalanceService } from './cash-balance.service';
import { CashWithdrawalsService } from './cash-withdrawals.service';
import { CashBalanceQueryDto, CreateCashRegisterDto, CreateCashWithdrawalDto, UpdateCashRegisterDto } from './dto/cash.dto';

@ApiTags('Cash')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cash-registers')
export class CashRegistersController {
  constructor(private readonly service: CashRegistersService, private readonly balances: CashBalanceService) {}

  @Get()
  @RequirePermission('read:cash-registers')
  findAll() { return this.service.findAll(); }

  /**
   * Shu xodim ishlay oladigan kassalar - kassa (POS), tushum, harajat va
   * hisobot filtrlari uchun. all=1 - yopilgan (faol emas) kassalar ham.
   */
  @Get('mine')
  @RequirePermission('read:pos', 'read:payments', 'read:cash-registers', 'read:cash-withdrawals', 'read:cash-balance')
  mine(@Req() req: any, @Query('all') all?: string) { return this.service.availableFor(req.user, all !== '1'); }

  /** Kassadagi hozirgi qoldiqlar (valyuta va to'lov turi bo'yicha) */
  @Get(':id/balance')
  @RequirePermission('read:cash-balance', 'read:cash-withdrawals', 'create:cash-withdrawals')
  balance(@Param('id', ParseUUIDPipe) id: string) { return this.balances.currentByRegister(id); }

  @Get(':id')
  @RequirePermission('read:cash-registers')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:cash-registers')
  create(@Body() dto: CreateCashRegisterDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:cash-registers')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCashRegisterDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:cash-registers')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}

@ApiTags('Cash')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cash-balance')
export class CashBalanceController {
  constructor(private readonly service: CashBalanceService) {}

  /** Kassadagi qoldiq: filial / kassa bo'yicha, sanadan - sanagacha */
  @Get()
  @RequirePermission('read:cash-balance')
  report(@Query() query: CashBalanceQueryDto) { return this.service.report(query); }
}

@ApiTags('Cash')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cash-withdrawals')
export class CashWithdrawalsController {
  constructor(private readonly service: CashWithdrawalsService) {}

  @Get()
  @RequirePermission('read:cash-withdrawals')
  findAll() { return this.service.findAll(); }

  /** Forma tanlovlari: kassalar, valyutalar, to'lov turlari, xodimlar */
  @Get('options')
  @RequirePermission('read:cash-withdrawals')
  options(@Req() req: any) { return this.service.options(req.user); }

  @Get(':id')
  @RequirePermission('read:cash-withdrawals')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:cash-withdrawals')
  create(@Body() dto: CreateCashWithdrawalDto, @Req() req: any) { return this.service.create(dto, req.user?.id); }

  @Delete(':id')
  @RequirePermission('delete:cash-withdrawals')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
