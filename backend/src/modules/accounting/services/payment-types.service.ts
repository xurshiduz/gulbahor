import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { PaymentType } from '../entities/payment-type.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from '../../administration/services/trim-fields';

@Injectable()
export class PaymentTypesService extends ReferenceService<PaymentType> {
  constructor(
    @InjectRepository(PaymentType)
    repo: Repository<PaymentType>,
  ) {
    super(repo, { label: 'To`lov turi', order: { name: 'ASC' } });
  }

  protected async prepare(dto: DeepPartial<PaymentType>, existing?: PaymentType) {
    const data = trimFields(dto, ['name', 'description']);
    if (data.name) await this.assertNameFree('name', data.name, existing?.id);
    return data;
  }
}
