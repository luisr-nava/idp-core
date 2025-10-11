import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.authService.createUser(createUserDto);
  }
  // @Post('login')
  // login(@Body() loginDto: any) {
  //   return this.authService.login(loginDto);
  // }
}
