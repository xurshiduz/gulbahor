import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto, ScanDto, UpdateInventoryDto } from './dto/inventory.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission('read:inventory')
  findAll() { return this.service.findAll(); }

  /** Forma: filiallar, omborlar, xodimlar */
  @Get('options')
  @RequirePermission('read:inventory')
  options() { return this.service.options(); }

  @Get(':id')
  @RequirePermission('read:inventory', 'scan:inventory')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:inventory')
  create(@Body() dto: CreateInventoryDto, @Req() req: any) { return this.service.create(dto, req.user?.id); }

  @Put(':id')
  @RequirePermission('update:inventory')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInventoryDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:inventory')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }

  @Post(':id/start')
  @RequirePermission('update:inventory', 'scan:inventory')
  start(@Param('id', ParseUUIDPipe) id: string) { return this.service.start(id); }

  /** Tugatish - natija qotiriladi */
  @Post(':id/finish')
  @RequirePermission('update:inventory')
  finish(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.finish(id, req.user?.id); }

  @Post(':id/reopen')
  @RequirePermission('update:inventory')
  reopen(@Param('id', ParseUUIDPipe) id: string) { return this.service.reopen(id); }

  @Post(':id/cancel')
  @RequirePermission('update:inventory')
  cancel(@Param('id', ParseUUIDPipe) id: string) { return this.service.cancel(id); }

  /** Skaner: RFID EPC yoki shtrix-kodlar (bir so'rovda 1000 tagacha) */
  @Post(':id/scans')
  @RequirePermission('scan:inventory')
  scan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScanDto, @Req() req: any) { return this.service.scan(id, dto.codes, req.user?.id); }

  @Get(':id/scans')
  @RequirePermission('read:inventory', 'scan:inventory')
  scans(@Param('id', ParseUUIDPipe) id: string, @Query('limit') limit?: string) { return this.service.recentScans(id, Number(limit) || 50); }

  @Delete(':id/scans/:scanId')
  @RequirePermission('scan:inventory')
  removeScan(@Param('id', ParseUUIDPipe) id: string, @Param('scanId', ParseUUIDPipe) scanId: string) { return this.service.removeScan(id, scanId); }

  /** Hisobot: kutilgan / sanalgan / kamomad / ortiqcha */
  @Get(':id/report')
  @RequirePermission('read:inventory')
  report(@Param('id', ParseUUIDPipe) id: string) { return this.service.report(id); }
}
