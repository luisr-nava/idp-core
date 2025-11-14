import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, {
    message: 'El código debe tener exactamente 6 dígitos',
  })
  code: string;
}
