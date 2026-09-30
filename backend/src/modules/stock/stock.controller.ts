import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { StockService } from './stock.service';
import { StockQueryDto } from './dto/stock.dto';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  /** Qoldiq: filial yoki omborxona bo'yicha, ikkalasi ham berilmasa - umumiy */
  @Get()
  @RequirePermission('read:stock')
  report(@Query() query: StockQueryDto) { return this.service.report(query); }

  /** Filtr uchun filiallar va omborxonalar */
  @Get('options')
  @RequirePermission('read:stock')
  options() { return this.service.options(); }
}
