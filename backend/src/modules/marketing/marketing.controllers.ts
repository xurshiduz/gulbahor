import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermission } from '../auth/guards/permissions.guard';
import {
  CarouselPromotionsService, DiscountPromotionsService, GiftPromotionsService, ReceiptPromotionsService,
} from './services/promotions.service';
import { GiftCertificatesService } from './services/gift-certificates.service';
import {
  CreateCarouselPromotionDto, CreateDiscountPromotionDto, CreateGiftCertificateDto, CreateGiftPromotionDto,
  CreateReceiptPromotionDto, SellGiftCertificateDto, UpdateCarouselPromotionDto, UpdateDiscountPromotionDto,
  UpdateGiftCertificateDto, UpdateGiftPromotionDto, UpdateReceiptPromotionDto,
} from './dto/marketing.dto';

/*
 * To'rt tur aksiya bir xil amallarga ega, lekin har birining DTO si boshqa -
 * tekshiruv (ValidationPipe) DTO sinfiga qarab ishlagani uchun controllerlar
 * alohida yozilgan. Huquq hammasida bitta: "promotions".
 */

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('discount-promotions')
export class DiscountPromotionsController {
  constructor(private readonly service: DiscountPromotionsService) {}

  @Get() @RequirePermission('read:promotions')
  findAll() { return this.service.findAll(); }

  @Post() @RequirePermission('create:promotions')
  create(@Body() dto: CreateDiscountPromotionDto) { return this.service.create(dto); }

  @Put(':id') @RequirePermission('update:promotions')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountPromotionDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermission('delete:promotions')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gift-promotions')
export class GiftPromotionsController {
  constructor(private readonly service: GiftPromotionsService) {}

  @Get() @RequirePermission('read:promotions')
  findAll() { return this.service.findAll(); }

  @Post() @RequirePermission('create:promotions')
  create(@Body() dto: CreateGiftPromotionDto) { return this.service.create(dto); }

  @Put(':id') @RequirePermission('update:promotions')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGiftPromotionDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermission('delete:promotions')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('carousel-promotions')
export class CarouselPromotionsController {
  constructor(private readonly service: CarouselPromotionsService) {}

  @Get() @RequirePermission('read:promotions')
  findAll() { return this.service.findAll(); }

  @Post() @RequirePermission('create:promotions')
  create(@Body() dto: CreateCarouselPromotionDto) { return this.service.create(dto); }

  @Put(':id') @RequirePermission('update:promotions')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCarouselPromotionDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermission('delete:promotions')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('receipt-promotions')
export class ReceiptPromotionsController {
  constructor(private readonly service: ReceiptPromotionsService) {}

  @Get() @RequirePermission('read:promotions')
  findAll() { return this.service.findAll(); }

  @Post() @RequirePermission('create:promotions')
  create(@Body() dto: CreateReceiptPromotionDto) { return this.service.create(dto); }

  @Put(':id') @RequirePermission('update:promotions')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReceiptPromotionDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermission('delete:promotions')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }
}

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gift-certificates')
export class GiftCertificatesController {
  constructor(private readonly service: GiftCertificatesService) {}

  @Get() @RequirePermission('read:gift-certificates')
  findAll() { return this.service.findAll(); }

  @Post() @RequirePermission('create:gift-certificates')
  create(@Body() dto: CreateGiftCertificateDto) { return this.service.create(dto); }

  @Put(':id') @RequirePermission('update:gift-certificates')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGiftCertificateDto) { return this.service.update(id, dto); }

  @Delete(':id') @RequirePermission('delete:gift-certificates')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.service.remove(id); }

  /** Sotish - alohida huquq: kassir sotadi, lekin yarata olmaydi */
  @Post(':id/sell') @RequirePermission('sell:gift-certificates')
  sell(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SellGiftCertificateDto) { return this.service.sell(id, dto.customerId); }

  @Post(':id/cancel') @RequirePermission('update:gift-certificates')
  cancel(@Param('id', ParseUUIDPipe) id: string) { return this.service.cancel(id); }
}
