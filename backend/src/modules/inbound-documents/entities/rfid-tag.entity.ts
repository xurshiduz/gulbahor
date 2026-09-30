import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { InboundDocument } from './inbound-document.entity';

/**
 * Bir dona tovarning RFID belgisi (etiketkasi).
 *
 * Kirim hujjatidagi har bir dona uchun alohida yozuv va takrorlanmas EPC
 * kodi: hujjatda 10 ta ko'ylak bo'lsa - 10 ta belgi. Etiketka chop
 * etilganda printer shu kodni chipga yozadi va keyin tovar aynan shu kod
 * bo'yicha taniladi (inventarizatsiya, sotuv, o'g'irlikka qarshi).
 *
 * Belgi hujjat qatoriga emas, hujjat + tovar + tartib raqamiga bog'langan:
 * hujjat qayta saqlanganda qatorlar yangilansa ham, allaqachon chop
 * etilgan etiketkalarning kodi o'zgarmaydi.
 */
@Entity('rfid_tags')
@Unique(['inboundDocumentId', 'materialId', 'unitNo'])
export class RfidTag {
  /** Ketma-ket raqam - EPC shundan yasaladi, shuning uchun takrorlanmaydi */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /** EPC kodi: 24 ta hex belgi (96 bit). Yozuv yaratilgach to'ldiriladi */
  @Index({ unique: true })
  @Column({ length: 24, nullable: true })
  epc: string;

  @Index()
  @Column({ type: 'uuid' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'materialId' })
  material: Material;

  /** Qaysi kirim hujjati bilan kelgan. Hujjat o'chirilsa belgi qoladi (etiketka tovarda turibdi) */
  @Column({ type: 'uuid', nullable: true })
  inboundDocumentId: string;

  @ManyToOne(() => InboundDocument, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inboundDocumentId' })
  inboundDocument: InboundDocument;

  /** Hujjatdagi shu tovarning nechanchi donasi: 1, 2, 3... */
  @Column({ type: 'int' })
  unitNo: number;

  /** Necha marta chop etilgan (0 - kod yaratilgan, lekin hali chop etilmagan) */
  @Column({ type: 'int', default: 0 })
  printCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastPrintedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
