import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ExpenseType } from '../entities/expense-type.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from '../../administration/services/trim-fields';

@Injectable()
export class ExpenseTypesService extends ReferenceService<ExpenseType> {
  constructor(
    @InjectRepository(ExpenseType)
    repo: Repository<ExpenseType>,
  ) {
    super(repo, { label: 'Harajat turi', order: { name: 'ASC' } });
  }

  protected async prepare(dto: DeepPartial<ExpenseType>, existing?: ExpenseType) {
    const data = trimFields(dto, ['name', 'description']);
    if (data.name) await this.assertNameFree('name', data.name, existing?.id);
    return data;
  }
}
