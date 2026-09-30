import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Branch } from '../entities/branch.entity';
import { Organization } from '../entities/organization.entity';
import { Warehouse } from '../entities/warehouse.entity';
import { User } from '../../users/entities/user.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from './trim-fields';

@Injectable()
export class BranchesService extends ReferenceService<Branch> {
  constructor(
    @InjectRepository(Branch)
    repo: Repository<Branch>,
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super(repo, { label: 'Filial', order: { name: 'ASC' }, relations: { organization: true } });
  }

  protected async prepare(dto: DeepPartial<Branch>, existing?: Branch) {
    const data = trimFields(dto, ['name', 'responsibleName', 'phone', 'address', 'organizationId']);

    if (data.organizationId) {
      const organization = await this.organizationRepo.findOne({ where: { id: data.organizationId } });
      if (!organization) throw new NotFoundException('Tashkilot topilmadi');
    }
    if (data.name) await this.assertNameFree('name', data.name, existing?.id);
    return data;
  }

  protected async assertRemovable(row: Branch) {
    const warehouses = await this.warehouseRepo.count({ where: { branchId: row.id } });
    if (warehouses) {
      throw new BadRequestException(`Bu filialda ${warehouses} ta omborxona bor. Avval ularni olib tashlang.`);
    }
    const users = await this.userRepo.count({ where: { branchId: row.id } });
    if (users) {
      throw new BadRequestException(`Bu filialga ${users} ta foydalanuvchi biriktirilgan. Avval ularni boshqa filialga o'tkazing.`);
    }
  }
}
