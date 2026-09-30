import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Contractor, ContractorType, SupplierKind } from '../entities/contractor.entity';
import { Country } from '../../references/entities/country.entity';
import { Region } from '../../references/entities/region.entity';
import { Currency } from '../../accounting/entities/currency.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from '../../administration/services/trim-fields';

const TEXT_FIELDS: (keyof Contractor)[] = [
  'name', 'fullName', 'inn', 'contactPerson', 'phone', 'email', 'address',
  'countryId', 'regionId', 'currencyId', 'bankName', 'bankAccount', 'bankCode', 'note',
];

/**
 * Mijozlar va yetkazib beruvchilar uchun umumiy mantiq. Har bir tur o'z
 * xizmatiga ega (pastda) - u faqat o'z turidagi yozuvlarni ko'radi, ya'ni
 * /customers orqali yetkazib beruvchini o'qib yoki o'zgartirib bo'lmaydi.
 */
abstract class ContractorsService extends ReferenceService<Contractor> {
  protected abstract readonly type: ContractorType;

  protected constructor(
    repo: Repository<Contractor>,
    label: string,
    private readonly countryRepo: Repository<Country>,
    private readonly regionRepo: Repository<Region>,
    private readonly currencyRepo: Repository<Currency>,
  ) {
    super(repo, { label, order: { name: 'ASC' }, relations: { country: true, region: true, currency: true } });
  }

  findAll() {
    return this.repo.find({ where: { type: this.type }, order: this.options.order, relations: this.options.relations });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id, type: this.type }, relations: this.options.relations });
    if (!row) throw new NotFoundException(`${this.options.label} topilmadi`);
    return row;
  }

  async update(id: string, dto: DeepPartial<Contractor>) {
    await this.findOne(id); // boshqa turdagi kontragent bo'lsa 404
    return super.update(id, dto);
  }

  protected async prepare(dto: DeepPartial<Contractor>, existing?: Contractor) {
    const data = trimFields(dto, TEXT_FIELDS);
    data.type = this.type;
    if (data.bankCode) data.bankCode = data.bankCode.toUpperCase();
    if (data.bankAccount) data.bankAccount = data.bankAccount.toUpperCase();

    if (this.type === ContractorType.CUSTOMER) {
      data.supplierKind = null;
      // Telefon va tug'ilgan kunni tahrirlashda ham bo'shatib bo'lmaydi
      // (DTO dagi umumiy @IsOptional tufayli yuborilmagan telefon tekshiruvdan o'tib ketadi - shu yerda ushlanadi)
      const phone = data.phone !== undefined ? data.phone : existing?.phone;
      if (!phone) throw new BadRequestException('Telefon raqam kiritilishi shart');
      if (!existing && !dto.birthDate) throw new BadRequestException('Tug`ilgan kun kiritilishi shart');
      if (dto.birthDate !== undefined) {
        const birth = String(dto.birthDate || '');
        const time = Date.parse(birth);
        if (!birth || Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== birth) {
          throw new BadRequestException('Tug`ilgan kun notog`ri');
        }
        if (time > Date.now()) throw new BadRequestException('Tug`ilgan kun kelajakda bo`lishi mumkin emas');
        if (birth < '1900-01-01') throw new BadRequestException('Tug`ilgan kun notog`ri');
      }
    } else {
      const kind = data.supplierKind || existing?.supplierKind;
      if (kind === SupplierKind.IMPORT) {
        // Xorijiy yetkazib beruvchi: davlat shart, viloyat va STIR bo'lmaydi
        const countryId = data.countryId !== undefined ? data.countryId : existing?.countryId;
        if (!countryId) throw new BadRequestException('Import yetkazib beruvchi uchun davlat tanlanishi shart');
        data.regionId = null;
        data.inn = null;
      } else if (data.supplierKind) {
        // Mahalliyga o'tkazilganda xorijiy davlat qolib ketmasin
        data.countryId = null;
      }
    }

    if (data.countryId && !(await this.countryRepo.findOne({ where: { id: data.countryId } }))) {
      throw new NotFoundException('Davlat topilmadi');
    }
    if (data.regionId && !(await this.regionRepo.findOne({ where: { id: data.regionId } }))) {
      throw new NotFoundException('Viloyat topilmadi');
    }
    if (data.currencyId && !(await this.currencyRepo.findOne({ where: { id: data.currencyId } }))) {
      throw new NotFoundException('Valyuta topilmadi');
    }

    // Nom va STIR o'z turi ichida takrorlanmaydi (bitta firma ham mijoz, ham yetkazib beruvchi bo'lishi mumkin)
    if (data.name) await this.assertNameFree('name', data.name, existing?.id, { type: this.type });
    if (data.inn) await this.assertNameFree('inn', data.inn, existing?.id, { type: this.type });
    return data;
  }
}

@Injectable()
export class CustomersService extends ContractorsService {
  protected readonly type = ContractorType.CUSTOMER;

  constructor(
    @InjectRepository(Contractor) repo: Repository<Contractor>,
    @InjectRepository(Country) countryRepo: Repository<Country>,
    @InjectRepository(Region) regionRepo: Repository<Region>,
    @InjectRepository(Currency) currencyRepo: Repository<Currency>,
  ) {
    super(repo, 'Mijoz', countryRepo, regionRepo, currencyRepo);
  }
}

@Injectable()
export class SuppliersService extends ContractorsService {
  protected readonly type = ContractorType.SUPPLIER;

  constructor(
    @InjectRepository(Contractor) repo: Repository<Contractor>,
    @InjectRepository(Country) countryRepo: Repository<Country>,
    @InjectRepository(Region) regionRepo: Repository<Region>,
    @InjectRepository(Currency) currencyRepo: Repository<Currency>,
  ) {
    super(repo, 'Yetkazib beruvchi', countryRepo, regionRepo, currencyRepo);
  }
}
