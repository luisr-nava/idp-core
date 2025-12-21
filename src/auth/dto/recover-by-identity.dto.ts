import { DocumentType } from '@/auth/entities/identity-document.entity';
import { IsEnum, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RecoverByIdentityDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: 'countryCode debe ser ISO-2 (ej: AR, CL)' })
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'countryCode debe contener solo letras (ISO-2)',
  })
  countryCode: string;

  @IsEnum(DocumentType, {
    message: 'documentType debe ser DNI, PASSPORT, NATIONAL_ID u OTHER',
  })
  documentType: DocumentType;

  @IsString()
  @IsNotEmpty()
  @Length(4, 32, {
    message: 'documentNumber debe tener entre 4 y 32 caracteres',
  })
  @Matches(/^[A-Za-z0-9.\- ]+$/, {
    message: 'documentNumber solo admite letras, números, puntos, guiones y espacios',
  })
  documentNumber: string;
}
