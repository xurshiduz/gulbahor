import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
import { CarouselTier, DiscountKind, Promotion, PromotionScope, PromotionType } from '../entities/promotion.entity';
import { ProductCategory } from '../../references/entities/product-category.entity';
import { Material } from '../../materials/entities/material.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { trimFields } from '../../administration/services/trim-fields';

/** DTO dan keladigan qo'shimcha maydonlar (entity da bog'lanish sifatida saqlanadi) */
type PromotionInput = DeepPartial<Promotion> & { categoryIds?: string[]; materialIds?: string[] };

/** Bazadan o'qilganda material to'liq kelmasin - ro'yxat uchun id va nom yetarli */
const RELATIONS = { categories: true, materials: true } as const;

/**
 * Aksiyalarning umumiy mantig'i: nom, muddat va qaysi tovarlarga tegishli
 * ekani. Har bir tur (chegirma, sovg'a, karusel, chek) o'z xizmatida
 * `applyRule` orqali o'z qoidasini tekshiradi va faqat o'z turidagi
 * aksiyalarni ko'radi.
 *
 * Eslatma: bu yerda aksiya faqat TA'RIFLANADI. Sotuvda qo'llash sotuv
 * (chiqim) moduli qo'shilganda shu ta'riflar asosida qilinadi.
 */
abstract class PromotionsService extends ReferenceService<Promotion> {
  protected abstract readonly type: PromotionType;
  /** Tovarlarga bog'lanadimi (chek aksiyasi bog'lanmaydi - butun chekka) */
  protected readonly scoped: boolean = true;

  protected constructor(
    repo: Repository<Promotion>,
    label: string,
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly materialRepo: Repository<Material>,
  ) {
    super(repo, { label, order: { createdAt: 'DESC' }, relations: RELATIONS });
  }

  findAll() {
    return this.repo.find({ where: { type: this.type }, order: this.options.order, relations: RELATIONS });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id, type: this.type }, relations: RELATIONS });
    if (!row) throw new NotFoundException(`${this.options.label} topilmadi`);
    return row;
  }

  async update(id: string, dto: DeepPartial<Promotion>) {
    await this.findOne(id); // boshqa turdagi aksiya bo'lsa 404
    return super.update(id, dto);
  }

  /** Turga xos qoida: tekshiradi va saqlanadigan maydonlarni to'ldiradi */
  protected abstract applyRule(data: DeepPartial<Promotion>, existing?: Promotion): void;

  protected async prepare(dto: PromotionInput, existing?: Promotion) {
    const { categoryIds, materialIds, ...rest } = dto;
    const data: DeepPartial<Promotion> = trimFields(rest, ['name', 'note', 'startDate', 'endDate']);
    data.type = this.type;

    if (data.name) await this.assertNameFree('name', data.name, existing?.id, { type: this.type });

    // Muddat: tugash boshlanishdan oldin bo'lmaydi
    const start = data.startDate !== undefined ? data.startDate : existing?.startDate;
    const end = data.endDate !== undefined ? data.endDate : existing?.endDate;
    for (const date of [data.startDate, data.endDate]) {
      if (date && Number.isNaN(Date.parse(date))) throw new BadRequestException('Sana notog`ri');
    }
    if (start && end && end < start) {
      throw new BadRequestException('Tugash sanasi boshlanish sanasidan oldin bo`lishi mumkin emas');
    }

    if (!this.scoped) {
      data.appliesTo = PromotionScope.ALL;
    } else if (data.appliesTo !== undefined) {
      // Qamrov to'liq yuboriladi: tur + o'sha turga mos ro'yxat. Boshqa ro'yxat tozalanadi
      data.categories = [];
      data.materials = [];
      if (data.appliesTo === PromotionScope.CATEGORIES) {
        if (!categoryIds?.length) throw new BadRequestException('Kamida bitta kategoriya tanlanishi shart');
        data.categories = await this.categoryRepo.findBy({ id: In(categoryIds) });
        if (data.categories.length !== new Set(categoryIds).size) throw new NotFoundException('Tanlangan kategoriyalardan biri topilmadi');
      } else if (data.appliesTo === PromotionScope.MATERIALS) {
        if (!materialIds?.length) throw new BadRequestException('Kamida bitta material tanlanishi shart');
        data.materials = await this.materialRepo.findBy({ id: In(materialIds) });
        if (data.materials.length !== new Set(materialIds).size) throw new NotFoundException('Tanlangan materiallardan biri topilmadi');
      }
    }

    this.applyRule(data, existing);
    return data;
  }

  /** Foizli chegirma 100% dan oshmasin */
  protected assertPercent(kind: DiscountKind, value: number) {
    if (kind === DiscountKind.PERCENT && value > 100) {
      throw new BadRequestException('Chegirma 100% dan oshmaydi');
    }
  }
}

/** Belgilangan chegirma (foiz / summa) yoki maxsus narx */
@Injectable()
export class DiscountPromotionsService extends PromotionsService {
  protected readonly type = PromotionType.DISCOUNT;

  constructor(
    @InjectRepository(Promotion) repo: Repository<Promotion>,
    @InjectRepository(ProductCategory) categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Material) materialRepo: Repository<Material>,
  ) {
    super(repo, 'Aksiya', categoryRepo, materialRepo);
  }

  protected applyRule(data: DeepPartial<Promotion>, existing?: Promotion) {
    const kind = (data.discountKind ?? existing?.discountKind) as DiscountKind;
    const value = (data.value ?? existing?.value) as number;
    this.assertPercent(kind, value);
  }
}

/** N ta sotib olsa M tasi sovg'a: 1+1, 2+1 */
@Injectable()
export class GiftPromotionsService extends PromotionsService {
  protected readonly type = PromotionType.GIFT;

  constructor(
    @InjectRepository(Promotion) repo: Repository<Promotion>,
    @InjectRepository(ProductCategory) categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Material) materialRepo: Repository<Material>,
  ) {
    super(repo, 'Aksiya', categoryRepo, materialRepo);
  }

  protected applyRule() {
    // Sonlar DTO da tekshirilgan (1..100) - qo'shimcha qoida yo'q
  }
}

/** Karusel: 1 = 20%, 2 = 30%, 3 = 40% */
@Injectable()
export class CarouselPromotionsService extends PromotionsService {
  protected readonly type = PromotionType.CAROUSEL;

  constructor(
    @InjectRepository(Promotion) repo: Repository<Promotion>,
    @InjectRepository(ProductCategory) categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Material) materialRepo: Repository<Material>,
  ) {
    super(repo, 'Aksiya', categoryRepo, materialRepo);
  }

  protected applyRule(data: DeepPartial<Promotion>) {
    if (data.tiers === undefined) return;
    const tiers = [...(data.tiers as CarouselTier[])]
      .map(({ quantity, percent }) => ({ quantity, percent }))
      .sort((a, b) => a.quantity - b.quantity);

    if (new Set(tiers.map((tier) => tier.quantity)).size !== tiers.length) {
      throw new BadRequestException('Bosqichlarda soni takrorlanmasligi kerak');
    }
    // Karuselning ma'nosi - ko'proq olgan ko'proq chegirma oladi
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].percent <= tiers[i - 1].percent) {
        throw new BadRequestException('Har keyingi bosqichda chegirma oldingisidan katta bo`lishi kerak');
      }
    }
    data.tiers = tiers;
  }
}

/** Chek summasi bo'yicha chegirma */
@Injectable()
export class ReceiptPromotionsService extends PromotionsService {
  protected readonly type = PromotionType.RECEIPT;
  protected readonly scoped = false;

  constructor(
    @InjectRepository(Promotion) repo: Repository<Promotion>,
    @InjectRepository(ProductCategory) categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Material) materialRepo: Repository<Material>,
  ) {
    super(repo, 'Aksiya', categoryRepo, materialRepo);
  }

  protected applyRule(data: DeepPartial<Promotion>, existing?: Promotion) {
    const kind = (data.discountKind ?? existing?.discountKind) as DiscountKind;
    const value = (data.value ?? existing?.value) as number;
    const minAmount = (data.minAmount ?? existing?.minAmount) as number;
    if (kind === DiscountKind.PRICE) throw new BadRequestException('Chek aksiyasida chegirma foiz yoki summa bo`ladi');
    this.assertPercent(kind, value);
    if (kind === DiscountKind.AMOUNT && value >= minAmount) {
      throw new BadRequestException('Chegirma summasi chekning eng kam summasidan kichik bo`lishi kerak');
    }
  }
}
