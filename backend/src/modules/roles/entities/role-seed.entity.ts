import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Qaysi doimiy rollar bir marta yaratilgani.
 *
 * Doimiy rolni admin o'chira oladi. Belgi bo'lmasa har ishga tushishda
 * o'chirilgan rol qaytadan paydo bo'lardi - shuning uchun yaratilgani
 * shu yerga yoziladi va qayta yaratilmaydi. Yangi qo'shilgan doimiy rol
 * (ro'yxatda bor, bu yerda yo'q) esa odatdagidek yaratiladi.
 */
@Entity('system_role_seeds')
export class RoleSeed {
  @PrimaryColumn()
  name: string;

  @CreateDateColumn()
  seededAt: Date;
}
