import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Region } from '../entities/region.entity';
import { Country } from '../entities/country.entity';
import { ReferenceService } from '../common/reference.service';
import { trimLocalized } from '../common/localized-name';

@Injectable()
export class RegionsService extends ReferenceService<Region> {
  constructor(
    @InjectRepository(Region)
    repo: Repository<Region>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {
    super(repo, {
      label: 'Viloyat',
      order: { country: { name: { uz: 'ASC' } }, name: { uz: 'ASC' } },
      relations: { country: true },
    });
  }

  protected async prepare(dto: DeepPartial<Region>, existing?: Region) {
    const data: DeepPartial<Region> = { ...dto };
    if (dto.name) data.name = trimLocalized(dto.name as any);

    if (data.countryId) {
      const country = await this.countryRepo.findOne({ where: { id: data.countryId } });
      if (!country) throw new NotFoundException('Davlat topilmadi');
    }

    // Nom bitta davlat ichida takrorlanmasin
    const countryId = data.countryId || existing?.countryId;
    const nameUz = data.name?.uz || existing?.name?.uz;
    if (data.name || data.countryId) {
      await this.assertNameFree('nameUz', nameUz, existing?.id, { countryId });
    }
    return data;
  }
}
