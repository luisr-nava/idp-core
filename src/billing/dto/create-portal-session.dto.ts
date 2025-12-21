import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreatePortalSessionDto {
  @IsOptional()
  @IsString()
  @IsUrl()
  returnUrl?: string;
}
