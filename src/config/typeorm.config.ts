import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
export const typeORMConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const logger = new Logger('TypeORM');

  // Si estás corriendo con npm run start:dev, usamos localhost
  const isLocal = process.env.NODE_ENV !== 'production';
  const host = isLocal ? 'localhost' : configService.get('DB_HOST') || 'db';

  logger.verbose(`🗄️ Conectando a Postgres en host: ${host}`);

  // SEGURIDAD: synchronize solo en desarrollo, NUNCA en producción
  if (process.env.NODE_ENV === 'production') {
    logger.warn(
      '⚠️  PRODUCCIÓN: synchronize deshabilitado. Usar migraciones para cambios de schema.',
    );
  }

  return {
    type: 'postgres', // 👈 ya no es string genérico
    host,
    port: parseInt(configService.get<string>('DB_PORT')!, 10) || 5432,
    username: configService.get<string>('DB_USERNAME') || 'postgres',
    password: configService.get<string>('DB_PASSWORD') || 'postgres',
    database: configService.get<string>('DB_NAME') || 'authdb',
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    synchronize: true,
    autoLoadEntities: true,
    retryAttempts: 5,
    retryDelay: 3000,
  };
};
