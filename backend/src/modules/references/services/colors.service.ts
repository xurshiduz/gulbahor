import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Color } from '../entities/color.entity';
import { ReferenceService } from '../common/reference.service';
import { trimLocalized } from '../common/localized-name';

/** "#abc" -> "#AABBCC"; bo'sh bo'lsa null */
function normalizeHex(value?: string): string | null {
  const hex = String(value || '').trim().toUpperCase();
  if (!hex) return null;
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    return '#' + hex.slice(1).split('').map((ch) => ch + ch).join('');
  }
  return hex;
}

@Injectable()
export class ColorsService extends ReferenceService<Color> {
  constructor(
    @InjectRepository(Color)
    repo: Repository<Color>,
  ) {
    super(repo, { label: 'Rang', order: { name: { uz: 'ASC' } } });
  }

  protected async prepare(dto: DeepPartial<Color>, existing?: Color) {
    const data: DeepPartial<Color> = { ...dto };
    if (dto.name) data.name = trimLocalized(dto.name as any);
    if (dto.hex !== undefined) data.hex = normalizeHex(dto.hex as string);
    if (dto.code !== undefined) data.code = String(dto.code || '').trim() || null;
    if (data.name) await this.assertNameFree('nameUz', data.name.uz, existing?.id);
    return data;
  }
}
