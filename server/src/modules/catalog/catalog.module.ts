import { Module } from '@nestjs/common'

import { AttributesService } from './attributes.service'
import { BrandsService } from './brands.service'
import { CategoriesService } from './categories.service'
import { PriceTypesService } from './price-types.service'
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
  ],
  providers: [CategoriesService, BrandsService, AttributesService, PriceTypesService, ProductsService],
  exports: [ProductsService],
})
export class CatalogModule {}
