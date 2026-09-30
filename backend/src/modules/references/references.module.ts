import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from './entities/product-category.entity';
import { ProductBrand } from './entities/product-brand.entity';
import { ProductUnit } from './entities/product-unit.entity';
import { Color } from './entities/color.entity';
import { Size } from './entities/size.entity';
import { Country } from './entities/country.entity';
import { Region } from './entities/region.entity';
import { CategoriesService } from './services/categories.service';
import { BrandsService } from './services/brands.service';
import { UnitsService } from './services/units.service';
import { ColorsService } from './services/colors.service';
import { SizesService } from './services/sizes.service';
import { CountriesService } from './services/countries.service';
import { RegionsService } from './services/regions.service';
import { CategoriesController } from './controllers/categories.controller';
import { BrandsController } from './controllers/brands.controller';
import { UnitsController } from './controllers/units.controller';
import { ColorsController } from './controllers/colors.controller';
import { SizesController } from './controllers/sizes.controller';
import { CountriesController } from './controllers/countries.controller';
import { RegionsController } from './controllers/regions.controller';
import { ReferencesSeedService } from './references-seed.service';

const SERVICES = [
  CategoriesService, BrandsService, UnitsService, ColorsService, SizesService, CountriesService, RegionsService,
];

/**
 * Material ma'lumotlari: kategoriyalar, brendlar, o'lchov birliklari,
 * ranglar, o'lchamlar, davlatlar, viloyatlar.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProductCategory, ProductBrand, ProductUnit, Color, Size, Country, Region])],
  providers: [...SERVICES, ReferencesSeedService],
  controllers: [
    CategoriesController, BrandsController, UnitsController, ColorsController, SizesController,
    CountriesController, RegionsController,
  ],
  exports: [...SERVICES, ReferencesSeedService, TypeOrmModule],
})
export class ReferencesModule {}
