import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ProductBrand } from '../entities/product-brand.entity';
import { Country } from '../entities/country.entity';
import { ReferenceService } from '../common/reference.service';

@Injectable()
export class BrandsService extends ReferenceService<ProductBrand> {
  constructor(
    @InjectRepository(ProductBrand)
    repo: Repository<ProductBrand>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {
    super(repo, { label: 'Brend', order: { name: 'ASC' }, relations: { country: true } });
  }

  protected async prepare(dto: DeepPartial<ProductBrand>, existing?: ProductBrand) {
    const data: DeepPartial<ProductBrand> = { ...dto };
    if (dto.name !== undefined) data.name = String(dto.name).trim();
    if (dto.description !== undefined) data.description = String(dto.description || '').trim() || null;
    if (dto.countryId !== undefined) data.countryId = (dto.countryId as string) || null;

    if (data.countryId) {
      const country = await this.countryRepo.findOne({ where: { id: data.countryId } });
      if (!country) throw new NotFoundException('Davlat topilmadi');
    }
    if (data.name) await this.assertNameFree('name', data.name, existing?.id);
    return data;
  }
}
