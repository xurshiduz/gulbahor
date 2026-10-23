import { MigrationInterface, QueryRunner } from 'typeorm'

/** A person's own picture, framed by them on the profile page and shown wherever their name is. */
export class UserAvatar1790000064000 implements MigrationInterface {
  name = 'UserAvatar1790000064000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN avatar text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN avatar`)
  }
}
