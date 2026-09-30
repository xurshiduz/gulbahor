import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { ColorsService } from '../services/colors.service';
import { CreateColorDto, UpdateColorDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('colors')
export class ColorsController {
  constructor(private readonly service: ColorsService) {}

  @Get()
  @RequirePermission('read:colors', 'read:materials')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:colors', 'read:materials')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:colors')
  create(@Body() dto: CreateColorDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:colors')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateColorDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:colors')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
