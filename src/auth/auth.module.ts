import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auth } from './entities/user.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Auth])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
