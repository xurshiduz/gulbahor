import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { Branch } from '../entities/branch.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from './trim-fields';

const TEXT_FIELDS: (keyof Organization)[] = [
  'name', 'fullName', 'inn', 'vatCode', 'oked', 'address', 'phone', 'email',
  'director', 'accountant', 'bankName', 'bankAccount', 'mfo',
];

@Injectable()
export class OrganizationsService extends ReferenceService<Organization> {
  constructor(
    @InjectRepository(Organization)
    repo: Repository<Organization>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {
    super(repo, { label: 'Tashkilot', order: { name: 'ASC' } });
  }

  protected async prepare(dto: DeepPartial<Organization>, existing?: Organization) {
    const data = trimFields(dto, TEXT_FIELDS);
    if (data.name) await this.assertNameFree('name', data.name, existing?.id);
    // Bitta STIR bilan ikkita tashkilot bo'lmaydi
    if (data.inn) await this.assertNameFree('inn', data.inn, existing?.id);
    return data;
  }

  protected async assertRemovable(row: Organization) {
    const branches = await this.branchRepo.count({ where: { organizationId: row.id } });
    if (branches) {
      throw new BadRequestException(`Bu tashkilotga ${branches} ta filial biriktirilgan. Avval ularni boshqa tashkilotga o'tkazing.`);
    }
  }
}
