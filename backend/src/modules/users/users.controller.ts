import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('read:users')
  findAll() { return this.usersService.findAll(); }

  @Get(':id')
  @RequirePermission('read:users')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.usersService.findOne(id); }

  @Post()
  @RequirePermission('create:users')
  create(@Body() dto: CreateUserDto, @Req() req: any) { return this.usersService.create(dto, req.user); }

  @Put(':id')
  @RequirePermission('update:users')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('delete:users')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.usersService.remove(id, req.user); }

  /* --------------------------- Faollik va parol --------------------------- */

  @Post(':id/activate')
  @RequirePermission('block:users')
  activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.usersService.activate(id, req.user); }

  @Post(':id/deactivate')
  @RequirePermission('block:users')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.usersService.deactivate(id, req.user); }

  /** Yangi parol yasaydi va javobda bir marta qaytaradi */
  @Post(':id/reset-password')
  @RequirePermission('update:users')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.usersService.resetPassword(id, req.user); }
}
