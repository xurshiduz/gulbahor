import { BeforeInsert, Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Role } from '../../roles/entities/role.entity';
import { Permission } from '../../permissions/entities/permission.entity';
import { Branch } from '../../administration/entities/branch.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  username: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  avatarUrl: string;

  // Google Auth
  @Column({ nullable: true })
  googleId: string;

  // QR Auth - beydjikdagi doimiy token
  @Column({ nullable: true })
  qrSecret: string;

  @Column({ default: false })
  qrEnabled: boolean;

  // FaceID Auth - yuz deskriptori (128 ta son, JSON)
  @Column({ type: 'text', nullable: true })
  faceIdData: string;

  @Column({ default: false })
  faceIdEnabled: boolean;

  /**
   * Avtobloklash: shuncha daqiqa harakatsizlikdan keyin ekran bloklanadi va
   * PIN so'raladi. Sessiyaning o'zi tugamaydi - foydalanuvchi PIN kiritib
   * ishini davom ettiradi. null/0 - o'chirilgan.
   */
  @Column({ type: 'int', nullable: true })
  autoLockMinutes: number;

  // 4 xonali PIN'ning bcrypt xeshi. Parol kabi javoblarga chiqmaydi.
  @Column({ nullable: true, select: false })
  lockPin: string;

  @Column({ default: false })
  lockPinEnabled: boolean;

  /** Faol emas - tizimga kira olmaydi (login ham, QR ham), ma'lumotlari esa joyida qoladi */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Tarmoq cheklovi yoqilgan bo'lsa (NETWORK_RESTRICTION=on) tizim faqat
   * ruxsat etilgan tarmoqdan ishlaydi; bu belgi bo'lsa xodim tashqaridan
   * (mobil internet, uy) ham kira oladi. Faqat Super admin qo'yadi.
   */
  @Column({ default: false })
  remoteAccess: boolean;

  /** Xodim ishlaydigan filial (Ma'muriyat -> Filiallar). Bo'sh - filialga biriktirilmagan */
  @Column({ type: 'uuid', nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  /**
   * eager EMAS: User ko'p joyda bog'lanish sifatida keladi (createdBy,
   * confirmedBy...). Rollar va huquqlar ham eager bo'lsa har shunday
   * so'rov rollar x huquqlar darajasida ko'payib ketardi.
   * Kerak joyda relations: ["roles", "roles.permissions"] bilan olinadi.
   */
  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];

  /**
   * Qo'shimcha huquqlar - rol huquqlaridan tashqari, shu xodimga alohida
   * berilgan (Foydalanuvchilar sahifasi). Rolni o'zgartirmasdan bitta
   * odamga bo'lim ochish uchun.
   */
  @ManyToMany(() => Permission)
  @JoinTable({ name: 'user_extra_permissions' })
  extraPermissions: Permission[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  async hashPassword() {
    if (this.password) {
      this.password = await bcrypt.hash(this.password, 10);
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }
}
