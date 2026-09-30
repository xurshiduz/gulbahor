import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, LessThanOrEqual, Repository } from 'typeorm';
import { Currency } from '../entities/currency.entity';
import { CurrencyRate } from '../entities/currency-rate.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from '../../administration/services/trim-fields';

/** Bugungi sana YYYY-MM-DD ko'rinishida (server vaqti bo'yicha) */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

@Injectable()
export class CurrenciesService extends ReferenceService<Currency> {
  constructor(
    @InjectRepository(Currency)
    repo: Repository<Currency>,
    @InjectRepository(CurrencyRate)
    private readonly rateRepo: Repository<CurrencyRate>,
  ) {
    // Asosiy valyuta (so'm) ro'yxat boshida
    super(repo, { label: 'Valyuta', order: { isBase: 'DESC', code: 'ASC' } });
  }

  /**
   * Ro'yxat joriy kurs bilan: har bir valyutaning bugungi kungacha
   * kiritilgan eng oxirgi kursi (kelajak sanadagisi hali kuchga kirmagan).
   */
  async findAll() {
    const currencies = await super.findAll();
    const rates = await this.rateRepo.find({
      where: { date: LessThanOrEqual(today()) },
      order: { date: 'DESC' },
    });

    const latest = new Map<string, CurrencyRate>();
    for (const rate of rates) {
      if (!latest.has(rate.currencyId)) latest.set(rate.currencyId, rate);
    }

    return currencies.map((currency) => ({
      ...currency,
      currentRate: currency.isBase ? 1 : latest.get(currency.id)?.rate ?? null,
      rateDate: currency.isBase ? null : latest.get(currency.id)?.date ?? null,
    })) as Currency[];
  }

  protected async prepare(dto: DeepPartial<Currency>, existing?: Currency) {
    const data = trimFields(dto, ['name', 'symbol', 'code']);
    if (data.code) data.code = data.code.toUpperCase();

    if (data.name) await this.assertNameFree('name', data.name, existing?.id);
    if (data.code) await this.assertNameFree('code', data.code, existing?.id);
    if (existing?.isBase && data.isActive === false) {
      throw new BadRequestException('Asosiy valyutani faolsizlantirib bo`lmaydi');
    }
    return data;
  }

  protected async assertRemovable(row: Currency) {
    if (row.isBase) throw new BadRequestException('Asosiy valyutani o`chirib bo`lmaydi');
    const rates = await this.rateRepo.count({ where: { currencyId: row.id } });
    if (rates) {
      throw new BadRequestException(`Bu valyutaga ${rates} ta kurs kiritilgan. Avval kurslarni olib tashlang.`);
    }
  }
}
