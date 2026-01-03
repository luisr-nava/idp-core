import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsOptional()
  @IsString()
  appKey?: string;

  @IsString()
  @IsNotEmpty()
  priceId: string;

  @IsUrl()
  successUrl: string;

  @IsUrl()
  cancelUrl: string;
}
