import { Column, CreateDateColumn, Entity, Index, JoinTable, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProductCategory } from '../../references/entities/product-category.entity';
import { Material } from '../../materials/entities/material.entity';

/** Aksiya turi */
export enum PromotionType {
  /** Belgilangan chegirma yoki maxsus narx */
  DISCOUNT = 'DISCOUNT',
  /** N ta sotib olsa M tasi sovg'a (1+1, 2+1...) */
  GIFT = 'GIFT',
  /** Karusel: soni oshgani sari chegirma o'sadi (1 = 20%, 2 = 30%...) */
  CAROUSEL = 'CAROUSEL',
  /** Chek summasi bo'yicha chegirma */
  RECEIPT = 'RECEIPT',
}

/** Aksiya qaysi tovarlarga tegishli */
export enum PromotionScope {
  ALL = 'ALL',
  CATEGORIES = 'CATEGORIES',
  MATERIALS = 'MATERIALS',
}

/** Chegirma ko'rinishi */
export enum DiscountKind {
  PERCENT = 'PERCENT', // foiz
  AMOUNT = 'AMOUNT', // summa (so'm)
  PRICE = 'PRICE', // maxsus narx (faqat DISCOUNT turida)
}

export interface CarouselTier {
  /** Nechanchi dona (yoki nechta) */
  quantity: number;
  /** Chegirma, foizda */
  percent: number;
}

const numeric = { to: (value: number) => value, from: (value: string) => (value === null ? null : Number(value)) };

/**
 * Aksiya. To'rt turi bitta jadvalda: umumiy qismi (nom, muddat, qaysi
 * tovarlarga) bir xil, farqi - qoida maydonlarida. Har bir tur faqat
 * o'ziga kerakli maydonlarni to'ldiradi, qolgani null.
 */
@Entity('promotions')
@Index(['type'])
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: PromotionType;

  @Column({ length: 160 })
  name: string;

  /** Amal qilish muddati (YYYY-MM-DD). Bo'sh - cheklanmagan */
  @Column({ type: 'date', nullable: true })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string;

  @Column({ type: 'varchar', length: 20, default: PromotionScope.ALL })
  appliesTo: PromotionScope;

  @ManyToMany(() => ProductCategory)
  @JoinTable({ name: 'promotion_categories' })
  categories: ProductCategory[];

  @ManyToMany(() => Material)
  @JoinTable({ name: 'promotion_materials' })
  materials: Material[];

  /* ------------------------------- Qoida maydonlari ------------------------------ */

  /** DISCOUNT, RECEIPT: chegirma ko'rinishi */
  @Column({ type: 'varchar', length: 20, nullable: true })
  discountKind: DiscountKind;

  /** DISCOUNT, RECEIPT: foiz, summa yoki maxsus narx */
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: numeric })
  value: number;

  /** GIFT: nechta sotib olinsa */
  @Column({ type: 'int', nullable: true })
  buyQuantity: number;

  /** GIFT: nechtasi sovg'a */
  @Column({ type: 'int', nullable: true })
  giftQuantity: number;

  /** CAROUSEL: bosqichlar */
  @Column({ type: 'jsonb', nullable: true })
  tiers: CarouselTier[];

  /** RECEIPT: chekning eng kam summasi */
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: numeric })
  minAmount: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
