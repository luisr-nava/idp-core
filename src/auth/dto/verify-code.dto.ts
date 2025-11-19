import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 8, {
    message: 'El código debe tener exactamente 8 dígitos',
  })
  code: string;
}
