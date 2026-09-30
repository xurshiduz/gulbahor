import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { ExpenseTypesService } from '../services/expense-types.service';
import { CreateExpenseTypeDto, UpdateExpenseTypeDto } from '../dto/accounting.dto';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expense-types')
export class ExpenseTypesController {
  constructor(private readonly service: ExpenseTypesService) {}

  @Get()
  @RequirePermission('read:expense-types')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:expense-types')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:expense-types')
  create(@Body() dto: CreateExpenseTypeDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:expense-types')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseTypeDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:expense-types')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
