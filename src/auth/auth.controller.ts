import {
  Body,
  Controller,
  ForbiddenException,
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
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { User, UserRole } from './entities/user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorators';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RecoverByIdentityDto } from './dto/recover-by-identity.dto';
import { RecoverConfirmDto } from './dto/recover-confirm.dto';

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
      ownerId: owner.id,
      appKey: owner.appKey,
    });
  }

  // Rate limit: 5 intentos de login por minuto
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // Rate limit: 3 intentos de verificación por minuto
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyCode(verifyCodeDto.code);
  }

  @Post('resend-verification-code')
  @HttpCode(HttpStatus.OK)
  resendVerificationCode(@Body() resendDto: ResendVerificationCodeDto) {
    return this.authService.resendVerificationCode(resendDto.email);
  }

  // Rate limit: 3 intentos de recuperación por hora
  @Throttle({ short: { limit: 3, ttl: 3600000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // Rate limit: 3 intentos de reset por hora
  @Throttle({ short: { limit: 3, ttl: 3600000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  // DEPRECADO: Este endpoint está protegido para evitar accesos no autorizados
  // Usar /auth/profile para actualizar tu propio perfil
  // o /auth/employee/:id para que OWNERs actualicen empleados
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('profile/:id')
  @Roles(UserRole.OWNER) // Solo OWNERs pueden usar este endpoint
  update(
    @GetUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    // Verificar que el usuario pertenece al mismo proyecto
    if (currentUser.role === UserRole.OWNER) {
      // Los OWNER pueden actualizar usuarios de su proyecto
      return this.authService.update(id, updateUserDto);
    }

    // Si llegamos aquí, no tiene permisos
    throw new ForbiddenException('No tienes permisos para actualizar este usuario');
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-user')
  getUser(@GetUser() user: User) {
    return this.authService.getUserById(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-employees')
  getEmployees(@GetUser() user: User) {
    return this.authService.getEmployeesByOwner(user.id);
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
    return this.authService.updateEmployee(employeeId, owner, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any, @GetUser() user: User) {
    // Extraer el token del header Authorization
    const token = req.headers.authorization?.replace('Bearer ', '');
    return this.authService.logout(token, user.id);
  }

  // ================= Recuperación por identidad (security sensitive) ================

  @Throttle({ long: { limit: 3, ttl: 3600000 } })
  @Post('recover-by-identity')
  @HttpCode(HttpStatus.OK)
  recoverByIdentity(@Body() dto: RecoverByIdentityDto, @Req() req: any) {
    return this.authService.recoverByIdentity(dto, this.getRequestMetadata(req));
  }

  @Throttle({ long: { limit: 3, ttl: 3600000 } })
  @Post('recover-confirm')
  @HttpCode(HttpStatus.OK)
  recoverConfirm(@Body() dto: RecoverConfirmDto) {
    return this.authService.recoverConfirm(dto);
  }

  private getRequestMetadata(req: any) {
    return {
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    };
  }
}
