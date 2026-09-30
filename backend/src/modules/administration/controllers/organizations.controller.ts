import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { OrganizationsService } from '../services/organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from '../dto/administration.dto';

@ApiTags('Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get()
  @RequirePermission('read:organizations', 'read:branches')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:organizations', 'read:branches')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:organizations')
  create(@Body() dto: CreateOrganizationDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:organizations')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:organizations')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
