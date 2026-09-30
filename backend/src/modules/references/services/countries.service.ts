import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import { Country } from '../entities/country.entity';
import { Region } from '../entities/region.entity';
import { ProductBrand } from '../entities/product-brand.entity';
import { ReferenceService } from '../common/reference.service';
import { trimLocalized } from '../common/localized-name';

@Injectable()
export class CountriesService extends ReferenceService<Country> {
  constructor(
    @InjectRepository(Country)
    repo: Repository<Country>,
    @InjectRepository(Region)
    private readonly regionRepo: Repository<Region>,
    @InjectRepository(ProductBrand)
    private readonly brandRepo: Repository<ProductBrand>,
  ) {
    super(repo, { label: 'Davlat', order: { name: { uz: 'ASC' } } });
  }

  protected async prepare(dto: DeepPartial<Country>, existing?: Country) {
    const data: DeepPartial<Country> = { ...dto };
    if (dto.name) data.name = trimLocalized(dto.name as any);
    if (dto.code !== undefined) data.code = String(dto.code || '').trim().toUpperCase() || null;

    if (data.name) await this.assertNameFree('nameUz', data.name.uz, existing?.id);
    if (data.code) {
      const taken = await this.repo.findOne({
        where: existing ? { code: data.code, id: Not(existing.id) } : { code: data.code },
      });
      if (taken) throw new ConflictException(`"${data.code}" kodi ${taken.name.uz} da band`);
    }
    return data;
  }

  protected async assertRemovable(row: Country) {
    const regions = await this.regionRepo.count({ where: { countryId: row.id } });
    if (regions) {
      throw new BadRequestException(`Bu davlatda ${regions} ta viloyat bor. Avval ularni olib tashlang.`);
    }
    const brands = await this.brandRepo.count({ where: { countryId: row.id } });
    if (brands) {
      throw new BadRequestException(`Bu davlat ${brands} ta brendga biriktirilgan. Avval brendlardan olib tashlang.`);
    }
  }
}
