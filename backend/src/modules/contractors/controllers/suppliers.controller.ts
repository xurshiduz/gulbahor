import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { SuppliersService } from '../services/contractors.service';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/contractors.dto';

@ApiTags('Contractors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @RequirePermission('read:suppliers')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:suppliers')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:suppliers')
  create(@Body() dto: CreateSupplierDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:suppliers')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:suppliers')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
