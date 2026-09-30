import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { SUPER_ADMIN_ROLE_PATTERN, userIsSuperAdmin } from '../auth/permissions.util';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Rollar ro'yxati foydalanuvchi formasida ham kerak - shuning uchun
   * "Foydalanuvchilar: ko'rish" huquqi ham yetarli.
   * Super admin roli faqat Super adminga ko'rinadi.
   */
  @Get()
  @RequirePermission('read:roles', 'read:users')
  async findAll(@Req() req: any) {
    const roles = await this.rolesService.findAll();
    return userIsSuperAdmin(req.user) ? roles : roles.filter((r) => !SUPER_ADMIN_ROLE_PATTERN.test(String(r.name || '').trim()));
  }

  @Get(':id')
  @RequirePermission('read:roles')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.rolesService.findOne(id); }

  @Post()
  @RequirePermission('create:roles')
  create(@Body() dto: CreateRoleDto) { return this.rolesService.create(dto); }

  @Put(':id')
  @RequirePermission('update:roles')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoleDto, @Req() req: any) {
    return this.rolesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('delete:roles')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.rolesService.remove(id, req.user); }
}
