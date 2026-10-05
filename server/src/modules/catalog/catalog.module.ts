import { Module } from '@nestjs/common'

import { AttributesService } from './attributes.service'
import { BrandsService } from './brands.service'
import { CategoriesService } from './categories.service'
import { PriceTypesService } from './price-types.service'
import { ProductImagesController } from './product-images.controller'
import { ProductImagesService } from './product-images.service'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import {
  AttributesController,
  BrandsController,
  CatalogController,
  CategoriesController,
  PriceTypesController,
} from './references.controller'

@Module({
  controllers: [
    CategoriesController,
    BrandsController,
    AttributesController,
    PriceTypesController,
    CatalogController,
    ProductsController,
    ProductImagesController,
  ],
  providers: [
    CategoriesService,
    BrandsService,
    AttributesService,
    PriceTypesService,
    ProductImagesService,
    ProductsService,
  ],
  exports: [ProductsService],
})
export class CatalogModule {}
