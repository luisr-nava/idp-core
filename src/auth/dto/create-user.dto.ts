import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty({
    message: 'El nombre de usuario es requerido',
  })
  @IsString()
  @Length(5, 20, {
    message: 'El nombre de usuario debe tener entre 5 y 20 caracteres',
  })
  userName: string;

  @IsNotEmpty({
    message: 'El nombre de usuario es requerido',
  })
  @IsString()
  @Length(5, 20, {
    message: 'El nombre de usuario debe tener entre 5 y 20 caracteres',
  })
  userLastName: string;

  @IsString()
  @Length(8, 20, {
    message: 'La contraseña debe tener entre 8 y 20 caracteres',
  })
  password: string;

  @IsString()
  @IsNotEmpty({
    message: 'El id del proyecto es requerido',
  })
  proyectId: string;

  @IsOptional()
  @IsBoolean()
  is_verify: boolean = false;
}
