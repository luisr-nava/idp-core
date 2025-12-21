import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategies';
import { MailModule } from '@/mail/mail.module';
import { BillingModule } from '@/billing/billing.module';
import { App } from '@/apps/entities/app.entity';
import { Subscription } from '@/billing/entities/subscription.entity';
import { EmployeeAccess } from '@/billing/entities/employee-access.entity';
import { IdentityDocument } from './entities/identity-document.entity';
import { IdentityRecoveryToken } from './entities/identity-recovery-token.entity';
import { AppKeyValidator } from '@/apps/app-key.validator';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AppKeyValidator],
  imports: [
    ConfigModule,
    MailModule,
    BillingModule,
    TypeOrmModule.forFeature([
      User,
      VerificationCode,
      PasswordReset,
      TokenBlacklist,
      App,
      Subscription,
      EmployeeAccess,
      IdentityDocument,
      IdentityRecoveryToken,
    ]),
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '15m' }, // Access token: 15 minutos
      }),
    }),
  ],
})
export class AuthModule {}
