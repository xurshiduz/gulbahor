import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { GROUPS, ReportsService } from './reports.service';

const filled = (key: string) => (o: any) => o[key] !== null && o[key] !== undefined && o[key] !== '';

export class ExecutiveQueryDto {
  @IsOptional() @ValidateIf(filled('from')) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana notog`ri' }) from?: string;
  @IsOptional() @ValidateIf(filled('to')) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana notog`ri' }) to?: string;
  @IsOptional() @IsIn(GROUPS) groupBy?: string;
  @IsOptional() @ValidateIf(filled('branchId')) @IsUUID('4') branchId?: string;
  @IsOptional() @ValidateIf(filled('warehouseId')) @IsUUID('4') warehouseId?: string;
  @IsOptional() @ValidateIf(filled('categoryId')) @IsUUID('4') categoryId?: string;
  @IsOptional() @ValidateIf(filled('materialId')) @IsUUID('4') materialId?: string;
  @IsOptional() @ValidateIf(filled('cashierId')) @IsUUID('4') cashierId?: string;
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /** Rahbar hisoboti: savdo, foyda, harajat - istalgan kesimda, ichma-ich filtrlar bilan */
  @Get('executive')
  @RequirePermission('read:executive-report')
  executive(@Query() query: ExecutiveQueryDto) { return this.service.executive(query as any); }
}
