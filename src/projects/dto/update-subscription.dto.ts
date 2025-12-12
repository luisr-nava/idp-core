import { SubscriptionType } from '@/auth/entities/user.entity';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class UpdateSubscriptionDto {
  @IsUUID(undefined, { message: 'projectId debe ser un UUID válido' })
  projectId: string;

  @IsUUID(undefined, { message: 'userId debe ser un UUID válido' })
  userId: string;

  @IsEnum(SubscriptionType, {
    message: 'subscriptionType debe ser FREE, PREMIUM o PRO',
  })
  subscriptionType: SubscriptionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ValidateIf((o) => o.durationDays === undefined)
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
