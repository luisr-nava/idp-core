import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config';

async function bootstrap() {
  const logger = new Logger('Auth - Running');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'verbose'],
  });

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  try {
    logger.verbose(`Server running in port ${envs.port}`);
    await app.listen(envs.port);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      logger.error(`❌ El puerto ${envs.port} ya está en uso!`);
    } else {
      logger.error('❌ Error inesperado:', error);
    }
    process.exit(1);
  }
}
bootstrap();
