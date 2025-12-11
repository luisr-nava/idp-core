import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({
    message: 'El nombre del proyecto es requerido',
  })
  @MinLength(3, {
    message: 'El nombre del proyecto debe tener al menos 3 caracteres',
  })
  @MaxLength(100, {
    message: 'El nombre del proyecto no puede exceder 100 caracteres',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  // Campos de autenticación para el guard (no se persisten)
  @IsOptional()
  @IsString()
  projectAdminEmail?: string;

  @IsOptional()
  @IsString()
  projectAdminToken?: string;
}
