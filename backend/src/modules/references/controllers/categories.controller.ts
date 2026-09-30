import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @RequirePermission('read:product-categories', 'read:materials', 'read:promotions')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:product-categories', 'read:materials', 'read:promotions')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:product-categories')
  create(@Body() dto: CreateCategoryDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:product-categories')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:product-categories')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
