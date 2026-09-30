import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { BrandsService } from '../services/brands.service';
import { CreateBrandDto, UpdateBrandDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-brands')
export class BrandsController {
  constructor(private readonly service: BrandsService) {}

  @Get()
  @RequirePermission('read:product-brands', 'read:materials')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:product-brands', 'read:materials')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:product-brands')
  create(@Body() dto: CreateBrandDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:product-brands')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:product-brands')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
