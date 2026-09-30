import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeepPartial, FindOptionsOrder, FindOptionsRelations, ObjectLiteral, Repository } from 'typeorm';

export interface ReferenceOptions<T extends ObjectLiteral> {
  /** Xato matnlarida ko'rinadigan nom: "Rang", "Brend" */
  label: string;
  /** Ro'yxat tartibi */
  order?: FindOptionsOrder<T>;
  /** Ro'yxatda va bitta yozuvda birga keladigan bog'lanishlar */
  relations?: FindOptionsRelations<T>;
}

/**
 * Ma'lumotnomalar (kategoriya, brend, rang, o'lcham...) uchun umumiy CRUD.
 *
 * Ularning hammasi bir xil ishlaydi: ro'yxat, bitta yozuv, qo'shish,
 * o'zgartirish, o'chirish. Farqi - tekshiruvlarda, shuning uchun har bir
 * ma'lumotnoma `prepare` (saqlashdan oldin) va `assertRemovable`
 * (o'chirishdan oldin) metodlarini o'zi yozadi.
 */
export abstract class ReferenceService<T extends ObjectLiteral & { id: string }> {
  protected constructor(
    protected readonly repo: Repository<T>,
    protected readonly options: ReferenceOptions<T>,
  ) {}

  findAll(): Promise<T[]> {
    return this.repo.find({ order: this.options.order, relations: this.options.relations });
  }

  async findOne(id: string): Promise<T> {
    const row = await this.repo.findOne({ where: { id } as any, relations: this.options.relations });
    if (!row) throw new NotFoundException(`${this.options.label} topilmadi`);
    return row;
  }

  async create(dto: DeepPartial<T>): Promise<T> {
    const data = await this.prepare(dto);
    const saved = await this.repo.save(this.repo.create(data));
    return this.findOne(saved.id);
  }

  async update(id: string, dto: DeepPartial<T>): Promise<T> {
    // Bog'lanishlarsiz o'qiladi: yuklangan eski bog'lanish obyekti (masalan
    // region.country) saqlashda yangi countryId ni bosib ketardi
    const row = await this.repo.findOne({ where: { id } as any });
    if (!row) throw new NotFoundException(`${this.options.label} topilmadi`);
    Object.assign(row, await this.prepare(dto, row));
    await this.repo.save(row);
    return this.findOne(id);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    await this.assertRemovable(row);
    try {
      await this.repo.remove(row);
    } catch (error: any) {
      // PostgreSQL 23503: boshqa jadval shu yozuvga bog'langan (masalan material shu kategoriyada)
      if (error?.code === '23503' || error?.driverError?.code === '23503') {
        throw new BadRequestException(`Bu ${this.options.label.toLowerCase()} boshqa joyda ishlatilmoqda - o'chirib bo'lmaydi. Kerak bo'lmasa faolsizlantiring.`);
      }
      throw error;
    }
    return { success: true };
  }

  /** Saqlashdan oldin tekshirish va normallashtirish. `existing` - tahrirlashda */
  protected async prepare(dto: DeepPartial<T>, _existing?: T): Promise<DeepPartial<T>> {
    return dto;
  }

  /** O'chirishga to'sqinlik: bog'liq yozuvlar bo'lsa xato tashlanadi */
  protected async assertRemovable(_row: T): Promise<void> {}

  /**
   * Nom band emasligini tekshiradi - katta-kichik harf farqsiz.
   *
   * Ustun nomi SQL ga to'g'ridan-to'g'ri qo'yiladi (embedded ustunlar
   * `nameUz` ko'rinishida bo'lgani uchun), qiymatlar esa parametr bilan.
   * `scope` - qo'shimcha shart: masalan nom faqat bitta ota kategoriya
   * ichida takrorlanmasligi kerak.
   */
  protected async assertNameFree(
    column: string,
    value: string,
    excludeId?: string,
    scope: Record<string, unknown> = {},
  ) {
    const qb = this.repo
      .createQueryBuilder('row')
      .where(`LOWER("row"."${column}") = :value`, { value: value.toLowerCase() });

    if (excludeId) qb.andWhere('row.id != :excludeId', { excludeId });
    for (const [key, val] of Object.entries(scope)) {
      if (val === null || val === undefined) qb.andWhere(`"row"."${key}" IS NULL`);
      else qb.andWhere(`"row"."${key}" = :${key}`, { [key]: val });
    }

    if (await qb.getCount()) {
      throw new ConflictException(`"${value}" - bunday ${this.options.label.toLowerCase()} allaqachon mavjud`);
    }
  }
}
