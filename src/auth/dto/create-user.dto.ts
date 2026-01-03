import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
  MaxLength,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 10 caracteres',
  })
  @MaxLength(128, {
    message: 'La contraseña no puede exceder 128 caracteres',
  })
  password: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  appKey?: string;

  @IsOptional()
  @IsBoolean()
  isVerify?: boolean;

  @IsString()
  @Length(3, 50)
  fullName: string;

  @IsEmail()
  email: string; // LEGACY_EMPLOYEE_COMPAT: requerido por el esquema local, no para autenticación

  @IsString()
  @IsOptional()
  role?: string;

  @IsOptional()
  @IsString()
  dni?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  salary?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;
  @IsOptional()
  @IsString()
  emergencyContact?: string;
}
