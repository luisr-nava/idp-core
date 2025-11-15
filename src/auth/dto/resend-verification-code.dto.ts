import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ResendVerificationCodeDto {
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
