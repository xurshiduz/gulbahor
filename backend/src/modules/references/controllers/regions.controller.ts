import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { RegionsService } from '../services/regions.service';
import { CreateRegionDto, UpdateRegionDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('regions')
export class RegionsController {
  constructor(private readonly service: RegionsService) {}

  @Get()
  @RequirePermission('read:regions', 'read:customers', 'read:suppliers')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:regions', 'read:customers', 'read:suppliers')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:regions')
  create(@Body() dto: CreateRegionDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:regions')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRegionDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:regions')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
