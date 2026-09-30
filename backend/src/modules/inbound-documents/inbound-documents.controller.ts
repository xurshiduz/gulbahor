import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { InboundDocumentsService } from './inbound-documents.service';
import { CreateInboundDocumentDto, UpdateInboundDocumentDto } from './dto/inbound-documents.dto';

@ApiTags('Inbound documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inbound-documents')
export class InboundDocumentsController {
  constructor(private readonly service: InboundDocumentsService) {}

  @Get()
  @RequirePermission('read:inbound-documents')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermission('read:inbound-documents')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermission('create:inbound-documents')
  create(@Body() dto: CreateInboundDocumentDto, @Req() req: any) { return this.service.create(dto, req.user?.id); }

  @Put(':id')
  @RequirePermission('update:inbound-documents')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInboundDocumentDto) { return this.service.update(id, dto); }

  /** Tasdiqlash - hujjat qulflanadi */
  @Post(':id/approve')
  @RequirePermission('approve:inbound-documents')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) { return this.service.approve(id, req.user?.id); }

  /** Qoralamaga qaytarish */
  @Post(':id/revert')
  @RequirePermission('approve:inbound-documents')
  revert(@Param('id', ParseUUIDPipe) id: string) { return this.service.revert(id); }

  @Delete(':id')
  @RequirePermission('delete:inbound-documents')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}
