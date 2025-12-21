import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../entities/user.entity';

// Helper para sanitizar inputs de texto (prevenir XSS)
const sanitizeText = (value: any): string => {
  if (typeof value !== 'string') return value;
  // Remover tags HTML y scripts
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
};

export class CreateUserDto {
  @IsNotEmpty({
    message: 'El nombre de usuario es requerido',
  })
  @Length(5, 20, {
    message: 'El nombre de usuario debe tener entre 5 y 20 caracteres',
  })
  @IsString()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(12, {
    message: 'La contraseña debe tener al menos 12 caracteres',
  })
  @MaxLength(128, {
    message: 'La contraseña no puede exceder 128 caracteres',
  })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    {
      message:
        'La contraseña debe contener al menos: 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial (@$!%*?&)',
    },
  )
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, {
    message:
      'El teléfono debe tener un formato válido (ej: +54 11 1234-5678, 11 1234 5678)',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7,8}$/, {
    message: 'El DNI debe tener 7 u 8 dígitos',
  })
  dni?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => sanitizeText(value))
  address?: string;

  @IsDate()
  @IsOptional()
  hireDate?: string;

  @IsString()
  @IsOptional()
  salary?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => sanitizeText(value))
  notes?: string;

  @IsString()
  @IsOptional()
  @Matches(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/i, {
    message:
      'La URL de la imagen debe ser válida y terminar en .jpg, .jpeg, .png, .gif, .webp o .svg',
  })
  profileImage?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => sanitizeText(value))
  emergencyContact?: string;

  @IsString()
  @IsNotEmpty()
  appKey: string;

  @IsOptional()
  @IsBoolean()
  isVerify?: boolean;

  @IsString()
  @IsOptional()
  stripeCustomerId?: string;
}
