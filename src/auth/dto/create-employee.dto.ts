import { OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class CreateEmployeeDto extends OmitType(CreateUserDto, [
  'stripeCustomerId',
] as const) {}
