import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { UnitsService } from '../services/units.service';
import { CreateUnitDto, UpdateUnitDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-units')
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get()
  @RequirePermission('read:product-units', 'read:materials')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:product-units', 'read:materials')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:product-units')
  create(@Body() dto: CreateUnitDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:product-units')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:product-units')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
