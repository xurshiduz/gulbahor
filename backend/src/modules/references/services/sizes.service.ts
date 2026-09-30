import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Size } from '../entities/size.entity';
import { ReferenceService } from '../common/reference.service';

@Injectable()
export class SizesService extends ReferenceService<Size> {
  constructor(
    @InjectRepository(Size)
    repo: Repository<Size>,
  ) {
    super(repo, { label: 'O`lcham', order: { scale: 'ASC', sortOrder: 'ASC', name: 'ASC' } });
  }

  protected async prepare(dto: DeepPartial<Size>, existing?: Size) {
    const data: DeepPartial<Size> = { ...dto };
    if (dto.name !== undefined) data.name = String(dto.name).trim();
    if (dto.scale !== undefined) data.scale = String(dto.scale || '').trim() || null;

    // Bitta nom turli shkalada uchraydi ("40" - kiyimda ham, poyabzalda ham)
    const scale = data.scale !== undefined ? data.scale : existing?.scale || null;
    if (data.name || data.scale !== undefined) {
      await this.assertNameFree('name', data.name || existing?.name, existing?.id, { scale });
    }
    return data;
  }
}
