import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { Region } from './entities/region.entity';
import { ProductUnit } from './entities/product-unit.entity';
import { Color } from './entities/color.entity';
import { Size } from './entities/size.entity';
import { ProductCategory } from './entities/product-category.entity';
import { SEED_CATEGORIES, SEED_COLORS, SEED_COUNTRIES, SEED_SIZES, SEED_UNITS, SEED_UZ_REGIONS } from './references-seed.data';

const name = ([uz, ru, en]: readonly string[]) => ({ uz, ru, en });

/**
 * Birinchi ishga tushishda ma'lumotnomalarni to'ldiradi. Har bir jadval
 * alohida tekshiriladi: bo'sh bo'lsagina yoziladi, ya'ni foydalanuvchi
 * o'chirgan yozuvlar keyingi ishga tushishda qaytib kelmaydi (jadval
 * butunlay bo'shatilmagan bo'lsa).
 */
@Injectable()
export class ReferencesSeedService {
  private readonly logger = new Logger(ReferencesSeedService.name);

  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(Region) private readonly regions: Repository<Region>,
    @InjectRepository(ProductUnit) private readonly units: Repository<ProductUnit>,
    @InjectRepository(Color) private readonly colors: Repository<Color>,
    @InjectRepository(Size) private readonly sizes: Repository<Size>,
    @InjectRepository(ProductCategory) private readonly categories: Repository<ProductCategory>,
  ) {}

  async seed() {
    if (!(await this.countries.count())) {
      await this.countries.save(SEED_COUNTRIES.map(([uz, ru, en, code]) => ({ name: { uz, ru, en }, code })));
      this.logger.log(`Davlatlar: ${SEED_COUNTRIES.length} ta`);
    }

    if (!(await this.regions.count())) {
      const uzbekistan = await this.countries.findOne({ where: { code: 'UZ' } });
      if (uzbekistan) {
        await this.regions.save(SEED_UZ_REGIONS.map((row) => ({ name: name(row), countryId: uzbekistan.id })));
        this.logger.log(`Viloyatlar: ${SEED_UZ_REGIONS.length} ta`);
      }
    }

    if (!(await this.units.count())) {
      await this.units.save(SEED_UNITS.map(([full, short]) => ({ name: name(full), shortName: name(short) })));
      this.logger.log(`O'lchov birliklari: ${SEED_UNITS.length} ta`);
    }

    if (!(await this.colors.count())) {
      await this.colors.save(SEED_COLORS.map(([uz, ru, en, hex]) => ({ name: { uz, ru, en }, hex })));
      this.logger.log(`Ranglar: ${SEED_COLORS.length} ta`);
    }

    if (!(await this.sizes.count())) {
      const rows = Object.entries(SEED_SIZES).flatMap(([scale, names]) =>
        names.map((sizeName, index) => ({ name: sizeName, scale, sortOrder: index + 1 })),
      );
      await this.sizes.save(rows);
      this.logger.log(`O'lchamlar: ${rows.length} ta`);
    }

    if (!(await this.categories.count())) {
      let total = 0;
      for (const [index, [parent, children]] of SEED_CATEGORIES.entries()) {
        const saved = await this.categories.save({ name: name(parent), sortOrder: index + 1 });
        await this.categories.save(
          children.map((child, i) => ({ name: name(child), parentId: saved.id, sortOrder: i + 1 })),
        );
        total += 1 + children.length;
      }
      this.logger.log(`Kategoriyalar: ${total} ta`);
    }
  }
}
