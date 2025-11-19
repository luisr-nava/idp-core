import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Verify2FADto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 12, {
    message:
      'El código debe tener entre 6 y 12 caracteres (código TOTP o código de recuperación)',
  })
  code: string;
}
