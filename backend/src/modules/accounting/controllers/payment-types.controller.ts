import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../../auth/guards/permissions.guard';
import { PaymentTypesService } from '../services/payment-types.service';
import { CreatePaymentTypeDto, UpdatePaymentTypeDto } from '../dto/accounting.dto';

@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payment-types')
export class PaymentTypesController {
  constructor(private readonly service: PaymentTypesService) {}

  @Get()
  @RequirePermission('read:payment-types')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:payment-types')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:payment-types')
  create(@Body() dto: CreatePaymentTypeDto) { return this.service.create(dto); }

  @Put(':id')
  @RequirePermission('update:payment-types')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentTypeDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('delete:payment-types')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
