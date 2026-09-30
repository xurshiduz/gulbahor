import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ProductCategory } from '../entities/product-category.entity';
import { ReferenceService } from '../common/reference.service';
import { trimLocalized } from '../common/localized-name';

/** Ichma-ich kategoriyalarning eng chuqur darajasi - tasodifiy uzun zanjirdan himoya */
const MAX_DEPTH = 5;

@Injectable()
export class CategoriesService extends ReferenceService<ProductCategory> {
  constructor(
    @InjectRepository(ProductCategory)
    repo: Repository<ProductCategory>,
  ) {
    super(repo, { label: 'Kategoriya', order: { sortOrder: 'ASC', name: { uz: 'ASC' } } });
  }

  protected async prepare(dto: DeepPartial<ProductCategory>, existing?: ProductCategory) {
    const data: DeepPartial<ProductCategory> = { ...dto };
    if (dto.name) data.name = trimLocalized(dto.name as any);
    // Bo'sh satr ham "ota yo'q" degani - forma tanlanmagan holatda shuni yuboradi
    if (dto.parentId !== undefined) data.parentId = (dto.parentId as string) || null;

    const parentId = data.parentId !== undefined ? data.parentId : existing?.parentId || null;
    if (parentId) await this.assertParentAllowed(parentId, existing);

    // Nom bitta ota ichida takrorlanmasin: "Ko'ylaklar" erkaklar va
    // ayollar kiyimida ham bo'lishi mumkin, lekin bitta joyda ikki marta emas
    const nameUz = data.name?.uz || existing?.name?.uz;
    if (data.name || data.parentId !== undefined) {
      await this.assertNameFree('nameUz', nameUz, existing?.id, { parentId });
    }
    return data;
  }

  /** Ota kategoriya bormi, o'ziga yoki o'z bolasiga bog'lanmayaptimi, chuqurlik yetarlimi */
  private async assertParentAllowed(parentId: string, existing?: ProductCategory) {
    if (existing && parentId === existing.id) {
      throw new BadRequestException('Kategoriya o`ziga ost kategoriya bo`la olmaydi');
    }

    let current = await this.repo.findOne({ where: { id: parentId } });
    if (!current) throw new NotFoundException('Ota kategoriya topilmadi');

    let depth = 1;
    while (current?.parentId) {
      if (existing && current.parentId === existing.id) {
        throw new BadRequestException('Kategoriyani o`z ost kategoriyasiga ko`chirib bo`lmaydi');
      }
      depth += 1;
      if (depth >= MAX_DEPTH) {
        throw new BadRequestException(`Kategoriyalar eng ko'pi ${MAX_DEPTH} daraja ichma-ich bo'ladi`);
      }
      current = await this.repo.findOne({ where: { id: current.parentId } });
    }
  }

  protected async assertRemovable(row: ProductCategory) {
    const children = await this.repo.count({ where: { parentId: row.id } });
    if (children) {
      throw new BadRequestException(
        `Bu kategoriyada ${children} ta ost kategoriya bor. Avval ularni o'chiring yoki boshqa joyga ko'chiring.`,
      );
    }
  }
}
