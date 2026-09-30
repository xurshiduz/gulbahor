import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from './entities/material.entity';
import { MaterialImage } from './entities/material-image.entity';
import { ReferencesModule } from '../references/references.module';
import { MaterialsService } from './materials.service';
import { MaterialsController } from './materials.controller';

/** Materiallar (tovarlar): xususiyatlari ma'lumotnomalardan, rasmlari va soliq kodlari bilan */
@Module({
  // ReferencesModule kategoriya, brend, birlik, rang, o'lcham, davlat repozitoriylarini beradi
  imports: [TypeOrmModule.forFeature([Material, MaterialImage]), ReferencesModule],
  providers: [MaterialsService],
  controllers: [MaterialsController],
  exports: [MaterialsService],
})
export class MaterialsModule {}
