import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { BranchesService } from '../services/branches.service';
import { CreateBranchDto, UpdateBranchDto } from '../dto/administration.dto';

@ApiTags('Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  @RequirePermission('read:branches', 'read:warehouses', 'read:users')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:branches', 'read:warehouses', 'read:users')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:branches')
  create(@Body() dto: CreateBranchDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:branches')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:branches')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
