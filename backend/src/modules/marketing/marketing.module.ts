import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { GiftCertificate } from './entities/gift-certificate.entity';
import { ProductCategory } from '../references/entities/product-category.entity';
import { Material } from '../materials/entities/material.entity';
import { Contractor } from '../contractors/entities/contractor.entity';
import {
  CarouselPromotionsService, DiscountPromotionsService, GiftPromotionsService, ReceiptPromotionsService,
} from './services/promotions.service';
import { GiftCertificatesService } from './services/gift-certificates.service';
import {
  CarouselPromotionsController, DiscountPromotionsController, GiftCertificatesController, GiftPromotionsController,
  ReceiptPromotionsController,
} from './marketing.controllers';

const SERVICES = [
  DiscountPromotionsService, GiftPromotionsService, CarouselPromotionsService, ReceiptPromotionsService,
  GiftCertificatesService,
];

/**
 * Marketing vositalari: sovg'a sertifikatlari va to'rt tur aksiya
 * (chegirma, N+M sovg'a, karusel, chek bo'yicha).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Promotion, GiftCertificate, ProductCategory, Material, Contractor])],
  providers: SERVICES,
  controllers: [
    GiftCertificatesController, DiscountPromotionsController, GiftPromotionsController,
    CarouselPromotionsController, ReceiptPromotionsController,
  ],
  exports: SERVICES,
})
export class MarketingModule {}
