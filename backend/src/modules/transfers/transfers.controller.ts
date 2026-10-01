import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { TransfersService } from './transfers.service';
import { CreateTransferDto, ReceiveTransferDto, ResolveCodesDto, UpdateTransferDto } from './dto/transfers.dto';

@ApiTags('Transfers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  /** Xodim filialidan chiquvchi va unga kiruvchi ko'chirishlar (administrator - hammasi) */
  @Get()
  @RequirePermission('read:transfers')
  findAll(@Req() req: any) { return this.service.findAll(req.user); }

  @Get('options')
  @RequirePermission('read:transfers')
  options(@Req() req: any) { return this.service.options(req.user); }

  /** Qabul kutayotganlar soni */
  @Get('pending')
  @RequirePermission('read:transfers')
  pending(@Req() req: any) { return this.service.pendingCount(req.user); }

  /** Skaner kodlari -> tovar (RFID metka yoki shtrix-kod) */
  @Post('resolve')
  @RequirePermission('create:transfers', 'update:transfers', 'receive:transfers')
  resolve(@Body() dto: ResolveCodesDto) { return this.service.resolve(dto.codes); }

  @Get(':id')
  @RequirePermission('read:transfers')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.findOne(id, req.user); }

  @Post()
  @RequirePermission('create:transfers')
  create(@Body() dto: CreateTransferDto, @Req() req: any) { return this.service.create(dto, req.user); }

  @Put(':id')
  @RequirePermission('update:transfers')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransferDto, @Req() req: any) { return this.service.update(id, dto, req.user); }

  @Post(':id/send')
  @RequirePermission('send:transfers')
  send(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.send(id, req.user); }

  @Post(':id/recall')
  @RequirePermission('send:transfers')
  recall(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.recall(id, req.user); }

  @Post(':id/receive')
  @RequirePermission('receive:transfers')
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveTransferDto, @Req() req: any) { return this.service.receive(id, dto, req.user); }

  @Post(':id/cancel')
  @RequirePermission('update:transfers')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.cancel(id, req.user); }

  @Delete(':id')
  @RequirePermission('delete:transfers')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.remove(id, req.user); }
}
