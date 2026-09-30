import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import { CurrencyRate } from '../entities/currency-rate.entity';
import { Currency } from '../entities/currency.entity';
import { ReferenceService } from '../../references/common/reference.service';

@Injectable()
export class CurrencyRatesService extends ReferenceService<CurrencyRate> {
  constructor(
    @InjectRepository(CurrencyRate)
    repo: Repository<CurrencyRate>,
    @InjectRepository(Currency)
    private readonly currencyRepo: Repository<Currency>,
  ) {
    super(repo, {
      label: 'Valyuta kursi',
      order: { date: 'DESC', currency: { code: 'ASC' } },
      relations: { currency: true },
    });
  }

  protected async prepare(dto: DeepPartial<CurrencyRate>, existing?: CurrencyRate) {
    const data: DeepPartial<CurrencyRate> = { ...dto };

    if (data.currencyId) {
      const currency = await this.currencyRepo.findOne({ where: { id: data.currencyId } });
      if (!currency) throw new NotFoundException('Valyuta topilmadi');
      // Kurs so'mga nisbatan yoziladi - so'mning o'ziga kurs bo'lmaydi
      if (currency.isBase) throw new BadRequestException('Asosiy valyutaga kurs kiritilmaydi');
    }
    if (data.date && Number.isNaN(Date.parse(data.date))) {
      throw new BadRequestException('Sana notog`ri');
    }

    // Bitta valyutaga bitta sanada bitta kurs
    const currencyId = data.currencyId || existing?.currencyId;
    const date = data.date || existing?.date;
    if (data.currencyId || data.date) {
      const taken = await this.repo.findOne({
        where: existing ? { currencyId, date, id: Not(existing.id) } : { currencyId, date },
      });
      if (taken) {
        throw new ConflictException(`Bu valyutaga ${date} sanasi uchun kurs allaqachon kiritilgan`);
      }
    }
    return data;
  }
}
