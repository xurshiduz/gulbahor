import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { DeepPartial, Repository } from 'typeorm';
import { CertificateStatus, GiftCertificate } from '../entities/gift-certificate.entity';
import { Contractor, ContractorType } from '../../contractors/entities/contractor.entity';
import { ReferenceService } from '../../references/common/reference.service';
import { today } from '../../accounting/services/currencies.service';

type CertificateInput = DeepPartial<GiftCertificate> & { count?: number };

/** Kod uchun belgilar: adashtiradigan 0/O, 1/I yo'q */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** GC-XXXX-XXXX ko'rinishidagi tasodifiy kod */
function generateCode() {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `GC-${part()}-${part()}`;
}

@Injectable()
export class GiftCertificatesService extends ReferenceService<GiftCertificate> {
  constructor(
    @InjectRepository(GiftCertificate) repo: Repository<GiftCertificate>,
    @InjectRepository(Contractor) private readonly contractorRepo: Repository<Contractor>,
  ) {
    super(repo, { label: 'Sertifikat', order: { createdAt: 'DESC', code: 'ASC' }, relations: { customer: true } });
  }

  private async uniqueCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateCode();
      if (!(await this.repo.findOne({ where: { code } }))) return code;
    }
    throw new ConflictException('Sertifikat kodi yasab bo`lmadi - qayta urinib ko`ring');
  }

  /**
   * Yaratish. `count` berilsa shuncha sertifikat bir yo'la yaratiladi -
   * hammasi bir xil nominal va muddat bilan, kodlari avtomatik.
   */
  async create(dto: CertificateInput) {
    const { count = 1, ...fields } = dto;
    if (count > 1 && fields.code) {
      throw new BadRequestException('Bir nechta sertifikat yaratilganda kod avtomatik beriladi - kod maydonini bo`sh qoldiring');
    }

    let first: GiftCertificate;
    for (let i = 0; i < count; i++) {
      const created = await super.create(fields);
      first = first || created;
    }
    return first;
  }

  protected async prepare(dto: CertificateInput, existing?: GiftCertificate) {
    const data: DeepPartial<GiftCertificate> = { ...dto };
    delete (data as CertificateInput).count;

    // Sotilgan sertifikatning nominali va kodi o'zgarmaydi - u mijozning qo'lida
    if (existing && existing.status !== CertificateStatus.NEW) {
      throw new BadRequestException('Faqat hali sotilmagan sertifikatni o`zgartirish mumkin');
    }

    if (dto.code !== undefined || !existing) {
      const code = String(dto.code || '').trim().toUpperCase();
      data.code = code || (existing ? existing.code : await this.uniqueCode());
      if (code) await this.assertNameFree('code', code, existing?.id);
    }
    if (dto.validUntil !== undefined) {
      data.validUntil = (dto.validUntil as string) || null;
      if (data.validUntil && Number.isNaN(Date.parse(data.validUntil))) throw new BadRequestException('Amal qilish muddati notog`ri');
      if (data.validUntil && data.validUntil < today()) throw new BadRequestException('Amal qilish muddati o`tib ketgan sana bo`lishi mumkin emas');
    }
    if (dto.note !== undefined) data.note = String(dto.note || '').trim() || null;
    // Sotilmagan sertifikatda qoldiq doim nominalga teng
    if (data.amount !== undefined) data.balance = data.amount;
    return data;
  }

  protected async assertRemovable(row: GiftCertificate) {
    if (row.status === CertificateStatus.SOLD || row.status === CertificateStatus.USED) {
      throw new BadRequestException('Sotilgan sertifikatni o`chirib bo`lmaydi - kerak bo`lsa bekor qiling');
    }
  }

  /** Sotish: sertifikat mijozga o'tadi va to'lovda ishlatish mumkin bo'ladi */
  async sell(id: string, customerId?: string | null) {
    const certificate = await this.repo.findOne({ where: { id } });
    if (!certificate) throw new NotFoundException('Sertifikat topilmadi');
    if (certificate.status !== CertificateStatus.NEW) {
      throw new BadRequestException('Bu sertifikat allaqachon sotilgan yoki bekor qilingan');
    }
    if (certificate.validUntil && certificate.validUntil < today()) {
      throw new BadRequestException('Sertifikatning amal qilish muddati o`tgan');
    }
    if (customerId) {
      const customer = await this.contractorRepo.findOne({ where: { id: customerId, type: ContractorType.CUSTOMER } });
      if (!customer) throw new NotFoundException('Mijoz topilmadi');
    }

    await this.repo.update(id, { status: CertificateStatus.SOLD, soldAt: new Date(), customerId: customerId || null });
    return this.findOne(id);
  }

  /** Bekor qilish: sertifikat endi ishlatilmaydi (yozuv tarix uchun qoladi) */
  async cancel(id: string) {
    const certificate = await this.repo.findOne({ where: { id } });
    if (!certificate) throw new NotFoundException('Sertifikat topilmadi');
    if (certificate.status === CertificateStatus.USED) throw new BadRequestException('To`liq ishlatilgan sertifikat bekor qilinmaydi');
    if (certificate.status === CertificateStatus.CANCELLED) return this.findOne(id);

    await this.repo.update(id, { status: CertificateStatus.CANCELLED });
    return this.findOne(id);
  }
}
