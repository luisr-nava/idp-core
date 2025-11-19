import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import { envs } from './config';

async function bootstrap() {
  const logger = new Logger('Auth - Running');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'verbose'],
  });

  // Configuración de seguridad con Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Permite CORS
      hsts: {
        maxAge: 31536000, // 1 año
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
    }),
  );

  // Límite de tamaño de request (prevenir ataques DoS)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  app.setGlobalPrefix('api/v1');

  // Configuración segura de CORS
  const allowedOrigins = [
    envs.frontendUrl || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:5173', // Vite default
  ].filter((origin): origin is string => origin !== undefined);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Permitir requests sin origin (como Postman, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn(`🚫 Origen bloqueado por CORS: ${origin}`);
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
    maxAge: 3600, // Cache preflight por 1 hora
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
