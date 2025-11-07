import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorators';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.authService.createUser({
      ...createUserDto,
      role: UserRole.OWNER,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('employee')
  @Roles(UserRole.OWNER)
  createEmployee(
    @GetUser() owner: User,
    @Body() createUserDto: CreateEmployeeDto,
  ) {
    return this.authService.createUser({
      ...createUserDto,
      role: UserRole.EMPLOYEE,
      projectId: owner.projectId,
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-user')
  getUser(@GetUser() user: User) {
    return this.authService.getUserById(user.id);
  }
}
