import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { CountriesService } from '../services/countries.service';
import { CreateCountryDto, UpdateCountryDto } from '../dto/references.dto';

@ApiTags('References')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('countries')
export class CountriesController {
  constructor(private readonly service: CountriesService) {}

  @Get()
  @RequirePermission('read:countries', 'read:regions', 'read:product-brands', 'read:suppliers', 'read:materials')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:countries', 'read:regions', 'read:product-brands', 'read:suppliers', 'read:materials')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:countries')
  create(@Body() dto: CreateCountryDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:countries')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCountryDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:countries')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
