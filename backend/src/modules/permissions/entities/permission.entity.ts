import { Column, CreateDateColumn, Entity, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../roles/entities/role.entity';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  action: string; // read, update, delete, block

  @Column()
  resource: string; // users, materials, product-categories, ...

  // Interfeysda ko'rsatiladigan o'zbekcha nomlar
  @Column({ nullable: true })
  resourceLabel: string; // "Foydalanuvchilar", "Materiallar", ...

  @Column({ nullable: true })
  actionLabel: string; // "Ko'rish", "Bloklash", "O'zgartirish", "O'chirish"

  // Ro'yxatdagi tartib (guruhlar va huquqlar bir xil ketma-ketlikda chiqishi uchun)
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ nullable: true })
  description: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
