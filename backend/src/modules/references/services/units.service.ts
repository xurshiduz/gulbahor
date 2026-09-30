import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ProductUnit } from '../entities/product-unit.entity';
import { ReferenceService } from '../common/reference.service';
import { trimLocalized } from '../common/localized-name';

@Injectable()
export class UnitsService extends ReferenceService<ProductUnit> {
  constructor(
    @InjectRepository(ProductUnit)
    repo: Repository<ProductUnit>,
  ) {
    super(repo, { label: 'O`lchov birligi', order: { name: { uz: 'ASC' } } });
  }

  protected async prepare(dto: DeepPartial<ProductUnit>, existing?: ProductUnit) {
    const data: DeepPartial<ProductUnit> = { ...dto };
    if (dto.name) data.name = trimLocalized(dto.name as any);
    if (dto.shortName) data.shortName = trimLocalized(dto.shortName as any);
    if (data.name) await this.assertNameFree('nameUz', data.name.uz, existing?.id);
    return data;
  }
}
