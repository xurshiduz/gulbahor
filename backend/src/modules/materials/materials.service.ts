import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Material } from './entities/material.entity';
import { MaterialImage } from './entities/material-image.entity';
import { ProductCategory } from '../references/entities/product-category.entity';
import { ProductBrand } from '../references/entities/product-brand.entity';
import { ProductUnit } from '../references/entities/product-unit.entity';
import { Color } from '../references/entities/color.entity';
import { Size } from '../references/entities/size.entity';
import { Country } from '../references/entities/country.entity';
import { ReferenceService } from '../references/common/reference.service';
import { trimFields } from '../administration/services/trim-fields';
import { MAX_IMAGES_PER_MATERIAL, materialImageUrl, removeUploadedFile } from './uploads';

const TEXT_FIELDS: (keyof Material)[] = [
  'name', 'sku', 'barcode', 'description', 'mxikCode', 'packageCode', 'tnvedCode',
  'brandId', 'colorId', 'sizeId', 'countryId',
];

/** Asosiy rasm birinchi, qolganlari yuklangan tartibda */
function sortImages(material: Material): Material {
  material.images = [...(material.images || [])].sort(
    (x, y) => Number(y.isMain) - Number(x.isMain) || x.sortOrder - y.sortOrder,
  );
  return material;
}

@Injectable()
export class MaterialsService extends ReferenceService<Material> {
  constructor(
    @InjectRepository(Material) repo: Repository<Material>,
    @InjectRepository(MaterialImage) private readonly imageRepo: Repository<MaterialImage>,
    @InjectRepository(ProductCategory) private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(ProductBrand) private readonly brandRepo: Repository<ProductBrand>,
    @InjectRepository(ProductUnit) private readonly unitRepo: Repository<ProductUnit>,
    @InjectRepository(Color) private readonly colorRepo: Repository<Color>,
    @InjectRepository(Size) private readonly sizeRepo: Repository<Size>,
    @InjectRepository(Country) private readonly countryRepo: Repository<Country>,
  ) {
    super(repo, {
      label: 'Material',
      order: { name: 'ASC' },
      relations: { category: true, brand: true, unit: true, color: true, size: true, country: true, images: true },
    });
  }

  async findAll() {
    return (await super.findAll()).map(sortImages);
  }

  async findOne(id: string) {
    return sortImages(await super.findOne(id));
  }

  protected async prepare(dto: DeepPartial<Material>, existing?: Material) {
    const data = trimFields(dto, TEXT_FIELDS);

    // Tanlangan ma'lumotnoma yozuvlari haqiqatan bormi
    const references: [keyof Material, Repository<any>, string][] = [
      ['categoryId', this.categoryRepo, 'Kategoriya'],
      ['unitId', this.unitRepo, 'O`lchov birligi'],
      ['brandId', this.brandRepo, 'Brend'],
      ['colorId', this.colorRepo, 'Rang'],
      ['sizeId', this.sizeRepo, 'O`lcham'],
      ['countryId', this.countryRepo, 'Davlat'],
    ];
    for (const [field, repo, label] of references) {
      const id = data[field] as string;
      if (id && !(await repo.findOne({ where: { id } }))) throw new NotFoundException(`${label} topilmadi`);
    }

    // Artikul va shtrix-kod takrorlanmaydi; nom takrorlanishi mumkin (rang/o'lchami boshqa bo'lgan tovarlar)
    if (data.sku) await this.assertCodeFree('sku', data.sku, 'artikul', existing?.id);
    if (data.barcode) await this.assertCodeFree('barcode', data.barcode, 'shtrix-kod', existing?.id);
    return data;
  }

  private async assertCodeFree(column: 'sku' | 'barcode', value: string, label: string, excludeId?: string) {
    const qb = this.repo.createQueryBuilder('m').where(`LOWER("m"."${column}") = :value`, { value: value.toLowerCase() });
    if (excludeId) qb.andWhere('m.id != :excludeId', { excludeId });
    const taken = await qb.getOne();
    if (taken) throw new BadRequestException(`"${value}" ${label}i "${taken.name}" da band`);
  }

  /** Material o'chirilganda rasmlari ham diskdan o'chadi (bazadan CASCADE bilan) */
  async remove(id: string) {
    const images = await this.imageRepo.find({ where: { materialId: id } });
    const result = await super.remove(id);
    images.forEach((image) => removeUploadedFile(image.url));
    return result;
  }

  /* ---------------------------------- Rasmlar --------------------------------- */

  /** Yuklangan fayllarni materialga biriktiradi. Birinchi rasm avtomatik asosiy bo'ladi */
  async addImages(id: string, files: { filename: string }[]) {
    const discard = () => files.forEach((file) => removeUploadedFile(materialImageUrl(file.filename)));
    if (!files?.length) throw new BadRequestException('Rasm tanlanmagan');

    const material = await this.repo.findOne({ where: { id } });
    if (!material) {
      discard();
      throw new NotFoundException('Material topilmadi');
    }

    const existing = await this.imageRepo.find({ where: { materialId: id } });
    if (existing.length + files.length > MAX_IMAGES_PER_MATERIAL) {
      discard();
      throw new BadRequestException(`Bitta materialga eng ko'pi ${MAX_IMAGES_PER_MATERIAL} ta rasm yuklanadi`);
    }

    const hasMain = existing.some((image) => image.isMain);
    const lastOrder = existing.reduce((max, image) => Math.max(max, image.sortOrder), 0);
    const created = await this.imageRepo.save(
      files.map((file, index) => ({
        materialId: id,
        url: materialImageUrl(file.filename),
        isMain: !hasMain && index === 0,
        sortOrder: lastOrder + index + 1,
      })),
    );
    // Yuklangan tartibda qaytadi - frontend qaysi fayl qaysi rasm ekanini shundan biladi
    return created.map(({ id: imageId, url, isMain, sortOrder }) => ({ id: imageId, url, isMain, sortOrder }));
  }

  /** Asosiy rasmni belgilaydi - har doim bittasi asosiy */
  async setMainImage(id: string, imageId: string) {
    const image = await this.imageRepo.findOne({ where: { id: imageId, materialId: id } });
    if (!image) throw new NotFoundException('Rasm topilmadi');
    await this.imageRepo.update({ materialId: id }, { isMain: false });
    await this.imageRepo.update(image.id, { isMain: true });
    return this.findOne(id);
  }

  /** Rasmni o'chiradi; asosiysi o'chirilsa keyingisi asosiy bo'ladi */
  async removeImage(id: string, imageId: string) {
    const image = await this.imageRepo.findOne({ where: { id: imageId, materialId: id } });
    if (!image) throw new NotFoundException('Rasm topilmadi');
    await this.imageRepo.remove(image);
    removeUploadedFile(image.url);

    if (image.isMain) {
      const next = await this.imageRepo.findOne({ where: { materialId: id }, order: { sortOrder: 'ASC' } });
      if (next) await this.imageRepo.update(next.id, { isMain: true });
    }
    return this.findOne(id);
  }
}
