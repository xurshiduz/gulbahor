import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/materials.dto';
import { MAX_IMAGES_PER_MATERIAL, materialImageUpload } from './uploads';

@ApiTags('Materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  @Get()
  @RequirePermission('read:materials', 'read:promotions')
  findAll() { return this.service.findAll(); }

  /** Skaner: shtrix-kod yoki artikul bo'yicha bitta tovar (hujjat formalari uchun) */
  @Get('by-barcode')
  @RequirePermission('read:materials', 'read:inbound-documents', 'read:outbound-documents', 'read:transfers')
  findByCode(@Query('code') code: string) { return this.service.findByCode(code); }

  /** Qidiruv oynasi: nom / artikul / shtrix-kod / MXIK */
  @Get('search')
  @RequirePermission('read:materials', 'read:inbound-documents', 'read:outbound-documents', 'read:transfers')
  search(@Query('q') q?: string, @Query('limit') limit?: string) { return this.service.search(q, Number(limit) || 30); }

  @Get(':id')
  @RequirePermission('read:materials', 'read:promotions')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:materials')
  create(@Body() dto: CreateMaterialDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:materials')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:materials')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }

  /* ---------------------------------- Rasmlar --------------------------------- */

  /** Bir nechta rasm yuklash: multipart, maydon nomi `files` */
  @Post(':id/images')
  @RequirePermission('update:materials')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES_PER_MATERIAL, materialImageUpload))
  addImages(@Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: any[]) {
    return this.service.addImages(id, files);
  }

  @Put(':id/images/:imageId/main')
  @RequirePermission('update:materials')
  setMainImage(@Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.service.setMainImage(id, imageId);
  }

  @Delete(':id/images/:imageId')
  @RequirePermission('update:materials')
  removeImage(@Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.service.removeImage(id, imageId);
  }
}
