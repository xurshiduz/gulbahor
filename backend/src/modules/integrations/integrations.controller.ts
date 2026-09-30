import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import { IntegrationsService } from './integrations.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { MarketplaceSyncService } from './marketplace-sync.service';
import { StartPaymentDto, UpdateIntegrationDto } from './dto/integrations.dto';

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly service: IntegrationsService,
    private readonly gateway: PaymentGatewayService,
    private readonly marketplaces: MarketplaceSyncService,
  ) {}

  /** Barcha integratsiyalar: holati, kalitlar (maxfiylari yashirilgan), sozlamalar */
  @Get()
  @RequirePermission('read:integrations')
  list() { return this.service.list(); }

  /** Kassadagi integratsiyalashgan to'lovlar ro'yxati */
  @Get('transactions')
  @RequirePermission('read:integrations')
  transactions() { return this.service.transactions(); }

  /* ------------------------------ Kassa: to'lov ------------------------------ */

  @Post('pay/start')
  @RequirePermission('sell:pos')
  start(@Body() dto: StartPaymentDto, @Req() req: any) { return this.gateway.start(dto, req.user); }

  @Get('pay/:id')
  @RequirePermission('sell:pos', 'read:integrations')
  status(@Param('id', ParseUUIDPipe) id: string) { return this.gateway.status(id); }

  @Post('pay/:id/cancel')
  @RequirePermission('sell:pos', 'update:integrations')
  cancel(@Param('id', ParseUUIDPipe) id: string) { return this.gateway.cancel(id); }

  /** UDS: xaridor kodi bo'yicha ball */
  @Get('uds/find')
  @RequirePermission('sell:pos')
  udsFind(@Query('code') code: string, @Query('total') total: string) { return this.gateway.udsFind(code, Number(total) || 0); }

  /* -------------------------------- Sozlamalar -------------------------------- */

  @Put(':code')
  @RequirePermission('update:integrations')
  save(@Param('code') code: string, @Body() dto: UpdateIntegrationDto) { return this.service.save(code, dto); }

  @Post(':code/test')
  @RequirePermission('update:integrations')
  test(@Param('code') code: string) { return this.service.test(code); }

  @Get(':code/logs')
  @RequirePermission('read:integrations')
  logs(@Param('code') code: string) { return this.service.logs(code); }

  /* ------------------------------ Marketpleyslar ------------------------------ */

  /** Marketpleysdagi omborlar (Uzum - do'konlar) */
  @Get(':code/warehouses')
  @RequirePermission('read:integrations')
  warehouses(@Param('code') code: string) { return this.marketplaces.warehouses(code); }

  /** Yuboriladigan qoldiq (yubormasdan ko'rish) */
  @Get(':code/preview')
  @RequirePermission('read:integrations')
  preview(@Param('code') code: string) { return this.marketplaces.preview(code); }

  /** Qoldiqni hozir yuborish */
  @Post(':code/sync')
  @RequirePermission('sync:integrations')
  sync(@Param('code') code: string) { return this.marketplaces.sync(code, 'manual'); }
}
