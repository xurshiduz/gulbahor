import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { WarehousesService } from '../services/warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from '../dto/administration.dto';

@ApiTags('Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get()
  @RequirePermission('read:warehouses')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:warehouses')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:warehouses')
  create(@Body() dto: CreateWarehouseDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:warehouses')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:warehouses')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
