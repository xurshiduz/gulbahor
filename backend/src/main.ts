import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import { UPLOADS_ROOT, UPLOADS_URL } from './modules/materials/uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Ro'yxatlar takrorlanuvchi JSON va juda yaxshi siqiladi.
  // 1 KB dan kichik javoblar siqilmaydi - foydasi yo'q.
  app.use(compression({ threshold: 1024 }));

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5175',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  app.setGlobalPrefix('api');

  // Yuklangan fayllar (material rasmlari): /uploads/...
  app.useStaticAssets(UPLOADS_ROOT, { prefix: UPLOADS_URL });

  const config = new DocumentBuilder()
    .setTitle('Gulbahor API')
    .setDescription('Gulbahor tizimi API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3002);
  console.log(`Gulbahor Backend running on port ${process.env.PORT || 3002}`);
  console.log(`Swagger docs: http://localhost:${process.env.PORT || 3002}/api/docs`);
}
bootstrap();
