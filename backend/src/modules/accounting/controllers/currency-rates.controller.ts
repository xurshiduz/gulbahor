import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { CurrencyRatesService } from '../services/currency-rates.service';
import { CreateCurrencyRateDto, UpdateCurrencyRateDto } from '../dto/accounting.dto';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('currency-rates')
export class CurrencyRatesController {
  constructor(private readonly service: CurrencyRatesService) {}

  @Get()
  @RequirePermission('read:currency-rates')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:currency-rates')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:currency-rates')
  create(@Body() dto: CreateCurrencyRateDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:currency-rates')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCurrencyRateDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:currency-rates')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
