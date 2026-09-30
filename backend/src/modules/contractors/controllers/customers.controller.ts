import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { CustomersService } from '../services/contractors.service';
import { CreateCustomerDto, UpdateCustomerDto } from '../dto/contractors.dto';

@ApiTags('Contractors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermission('read:customers', 'sell:gift-certificates')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:customers', 'sell:gift-certificates')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:customers')
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:customers')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:customers')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
