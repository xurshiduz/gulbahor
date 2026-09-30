import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Warehouse } from '../entities/warehouse.entity';
import { Branch } from '../entities/branch.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from './trim-fields';

@Injectable()
export class WarehousesService extends ReferenceService<Warehouse> {
  constructor(
    @InjectRepository(Warehouse)
    repo: Repository<Warehouse>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {
    super(repo, {
      label: 'Omborxona',
      order: { branch: { name: 'ASC' }, name: 'ASC' },
      relations: { branch: true },
    });
  }

  protected async prepare(dto: DeepPartial<Warehouse>, existing?: Warehouse) {
    const data = trimFields(dto, ['name', 'responsibleName', 'address']);

    if (data.branchId) {
      const branch = await this.branchRepo.findOne({ where: { id: data.branchId } });
      if (!branch) throw new NotFoundException('Filial topilmadi');
    }

    // Nom bitta filial ichida takrorlanmasin
    const branchId = data.branchId || existing?.branchId;
    if (data.name || data.branchId) {
      await this.assertNameFree('name', data.name || existing?.name, existing?.id, { branchId });
    }
    return data;
  }
}
