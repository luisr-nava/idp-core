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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { User, UserRole } from './entities/user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
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

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Este endpoint inicia el flujo de autenticación con Google
    // El guard redirige automáticamente a Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: any) {
    // Este endpoint recibe el callback de Google
    // req.user contiene los datos del usuario de Google
    // El servicio generará automáticamente un projectId para nuevos usuarios
    return this.authService.googleAuth(req.user);
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyCode(verifyCodeDto.code);
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

  @UseGuards(JwtAuthGuard)
  @Get('get-employees/by-projects')
  getEmployees(@GetUser() user: User) {
    return this.authService.getEmployeesByProject(user.projectId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(
    @GetUser() user: User,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateOwnProfile(user.id, updateProfileDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('employee/:id')
  @Roles(UserRole.OWNER)
  updateEmployee(
    @Param('id', ParseUUIDPipe) employeeId: string,
    @GetUser() owner: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.updateEmployee(
      employeeId,
      owner.projectId,
      updateUserDto,
    );
  }
}
