import { OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString } from 'class-validator';

export class CreateEmployeeDto extends OmitType(CreateUserDto, [
  'projectId',
  'stripeCustomerId',
] as const) {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  stripeCustomerId?: string;
}
