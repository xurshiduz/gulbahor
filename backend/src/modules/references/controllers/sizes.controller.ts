import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { SizesService } from '../services/sizes.service';
import { CreateSizeDto, UpdateSizeDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sizes')
export class SizesController {
  constructor(private readonly service: SizesService) {}

  @Get()
  @RequirePermission('read:sizes', 'read:materials')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:sizes', 'read:materials')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:sizes')
  create(@Body() dto: CreateSizeDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:sizes')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSizeDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:sizes')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
