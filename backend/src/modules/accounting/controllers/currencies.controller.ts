import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { CurrenciesService } from '../services/currencies.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from '../dto/accounting.dto';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get()
  @RequirePermission('read:currencies', 'read:currency-rates', 'read:customers', 'read:suppliers', 'read:inbound-documents')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:currencies', 'read:currency-rates', 'read:customers', 'read:suppliers', 'read:inbound-documents')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:currencies')
  create(@Body() dto: CreateCurrencyDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:currencies')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCurrencyDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:currencies')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
