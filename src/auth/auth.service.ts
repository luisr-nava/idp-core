import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SubscriptionType, User, UserRole } from './entities/user.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { In, LessThan, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MailService } from '@/mail/mail.service';
import { envs } from '@/config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Project } from '@/projects/entities/project.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly devProEmails = new Set(envs.subscriptionTestEmails || []);

  constructor(
    @InjectRepository(User)
    private readonly authRepository: Repository<User>,
    @InjectRepository(VerificationCode)
    private readonly verificationCodeRepository: Repository<VerificationCode>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(TokenBlacklist)
  private readonly tokenBlacklistRepository: Repository<TokenBlacklist>,
  @InjectRepository(Project)
  private readonly projectRepository: Repository<Project>,
  private readonly jwtService: JwtService,
  private readonly mailService: MailService,
  ) {}
  async createUser(createUserDto: CreateUserDto) {
    const {
      password,
      projectId,
      role: providedRole,
      stripeCustomerId,
      ...user
    } = createUserDto;
    const role = providedRole || UserRole.EMPLOYEE;

    if (!projectId) {
      throw new BadRequestException(
        'El projectId es requerido para crear un usuario.',
      );
    }

    if (role === UserRole.OWNER && !stripeCustomerId) {
      throw new BadRequestException(
        'El stripeCustomerId es requerido para el usuario owner.',
      );
    }

    const project = await this.ensureProjectExists(projectId);

    // Validar que el email no exista (para OWNER, validar globalmente; para EMPLOYEE, validar por proyecto)
    if (role === UserRole.OWNER) {
      await this.validateOwnerEmailUnique(user.email);
    } else {
      await this.validateUserExistence(user.email, projectId);
    }

    const newUser = this.authRepository.create({
      ...user,
      role,
      projectId,
      stripeCustomerId: role === UserRole.OWNER ? stripeCustomerId : null,
      subscriptionType: project.subscriptionType,
      subscriptionExpiresAt: project.subscriptionExpiresAt,
      password: bcrypt.hashSync(password, 10),
    });

    await this.authRepository.save(newUser);

    // Enviar email de verificación con el projectId
    await this.createAndSendVerificationCode(
      newUser.id,
      newUser.email,
      newUser.fullName,
      project.name,
    );

    return {
      message:
        'Usuario creado correctamente. Se ha enviado un código de verificación a tu email',
      projectId: newUser.projectId,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.authRepository.findOneBy({ email });

    // Verificar si la cuenta está bloqueada
    if (user && user.lockUntil && new Date() < user.lockUntil) {
      const minutesLeft = Math.ceil(
        (user.lockUntil.getTime() - new Date().getTime()) / 60000,
      );
      this.logger.warn(
        `🔒 Cuenta bloqueada: ${email} | Tiempo restante: ${minutesLeft} minutos`,
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente. Intenta nuevamente en ${minutesLeft} minutos.`,
      );
    }

    // Protección contra timing attacks: siempre ejecutar bcrypt incluso si el usuario no existe
    const dummyHash =
      '$2b$10$invalidhashtopreventtimingattackXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash);

    // Mensaje genérico para no revelar si el email existe o la contraseña es incorrecta
    if (!user || !isPasswordValid) {
      // Incrementar contador de intentos fallidos
      if (user) {
        await this.handleFailedLogin(user);
      }

      // Logging de intento fallido
      this.logger.warn(
        `🚫 Intento de login fallido: ${email} | IP: ${this.getClientInfo()}`,
      );
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    // Verificar si el usuario ha verificado su cuenta
    if (!user.isVerify) {
      this.logger.warn(
        `⚠️ Intento de login sin verificar: ${email} | UserId: ${user.id}`,
      );
      throw new UnauthorizedException(
        'Debes verificar tu cuenta antes de iniciar sesión. Revisa tu email para obtener el código de verificación',
      );
    }

    // Verificar si el usuario tiene 2FA habilitado
    if (user.twoFactorEnabled) {
      // Generar un token temporal para la verificación 2FA (válido por 5 minutos)
      const tempToken = this.jwtService.sign(
        {
          id: user.id,
          email: user.email,
          temp2FA: true,
        },
        { expiresIn: '5m' },
      );

      this.logger.log(
        `🔐 Login con 2FA pendiente: ${email} | UserId: ${user.id}`,
      );

      return {
        requires2FA: true,
        tempToken,
        message: 'Ingresa el código de autenticación de dos factores',
      };
    }

    // Resetear intentos fallidos y actualizar último login
    await this.authRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockUntil: undefined,
      lastLogin: new Date(),
    });
    const project = await this.enforceSubscription(user);
    if (project) {
      user.subscriptionType = project.subscriptionType;
      user.subscriptionExpiresAt = project.subscriptionExpiresAt;
    }

    const token = this.getJwtToken({
      id: user.id,
      role: user.role,
      projectId: user.projectId,
      email: user.email,
    });

    // Generar refresh token
    const refreshToken = await this.generateRefreshToken(user.id);

    // Logging de login exitoso
    this.logger.log(
      `✅ Login exitoso: ${email} | UserId: ${user.id} | Rol: ${user.role}`,
    );

    return {
      token,
      refreshToken,
      user: this.sanitizeUser(user),
      projectId: user.projectId,
    };
  }

  async googleAuth(googleUser: any) {
    // Buscar si el usuario ya existe por email
    let user = await this.authRepository.findOneBy({
      email: googleUser.email,
    });

    // Si el usuario no existe, crearlo con nuevo proyecto y trial por proyecto
    if (!user) {
      const projectName = this.buildProjectNameFromUser(
        googleUser.fullName,
        googleUser.email,
      );

      const project = await this.projectRepository.save(
        this.projectRepository.create({
          name: projectName,
          ...this.getProjectTrialSubscription(),
        }),
      );

      const newUser = this.authRepository.create({
        email: googleUser.email,
        fullName: googleUser.fullName,
        password: bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10), // Password criptográficamente seguro
        role: UserRole.OWNER,
        projectId: project.uuid,
        subscriptionType: project.subscriptionType,
        subscriptionExpiresAt: project.subscriptionExpiresAt,
        isVerify: true, // Usuarios de Google están verificados automáticamente
        profileImage: googleUser.picture,
      });

      user = await this.authRepository.save(newUser);
    } else {
      // Si el usuario existe, actualizar isVerify a true si no lo estaba
      if (!user.isVerify) {
        await this.authRepository.update(user.id, { isVerify: true });
        user.isVerify = true;
      }
    }

    const project = await this.enforceSubscription(user);
    if (project) {
      user.subscriptionType = project.subscriptionType;
      user.subscriptionExpiresAt = project.subscriptionExpiresAt;
    }

    const token = this.getJwtToken({
      id: user.id,
      role: user.role,
      projectId: user.projectId,
      email: user.email,
    });

    return {
      token,
      user: this.sanitizeUser(user),
      projectId: user.projectId,
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // SEGURIDAD: Excluir campos sensibles que no deben ser actualizables directamente
    const {
      password,
      projectId,
      role,
      isVerify,
      stripeCustomerId,
      ...user
    } = updateUserDto;

    const existingUser = await this.authRepository.findOneBy({ id });

    if (!existingUser) {
      return { success: false, errors: ['Usuario no encontrado.'] };
    }

    // Evitar duplicado de email
    if (user.email && user.email !== existingUser.email) {
      await this.validateUserExistence(user.email, existingUser.projectId);
    }

    // Hashear password si viene
    const updatedData: UpdateUserDto = { ...user };

    if (existingUser.role === UserRole.OWNER && stripeCustomerId !== undefined) {
      updatedData.stripeCustomerId = stripeCustomerId;
    } else if (existingUser.role !== UserRole.OWNER) {
      updatedData.stripeCustomerId = null;
    }

    if (password) {
      updatedData.password = await bcrypt.hash(password, 10);
    }

    await this.authRepository.update(id, updatedData);

    return { success: true, message: 'Usuario actualizado correctamente.' };
  }

  async getUserById(id: string) {
    const user = await this.authRepository.findOneBy({ id });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return this.sanitizeUserForProfile(user);
  }

  async getEmployeesByProject(projectId: string) {
    const employees = await this.authRepository.find({
      where: {
        projectId,
        role: In([UserRole.EMPLOYEE, UserRole.MANAGER]),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        phone: true,
        dni: true,
        address: true,
        salary: true,
        hireDate: true,
        projectId: true,
        createdAt: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (!employees.length) {
      throw new NotFoundException(
        'No se encontraron empleados para este proyecto',
      );
    }

    return employees;
  }

  async updateEmployee(
    employeeId: string,
    ownerProjectId: string,
    updateUserDto: UpdateUserDto,
  ) {
    // SEGURIDAD: Excluir campos sensibles
    const { password, projectId, role, isVerify, ...updateData } =
      updateUserDto;

    // Buscar el empleado
    const employee = await this.authRepository.findOneBy({ id: employeeId });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    // Validar que el empleado pertenezca al proyecto del owner
    if (employee.projectId !== ownerProjectId) {
      throw new UnauthorizedException(
        'No tenés permisos para actualizar este empleado',
      );
    }

    // Validar que no sea un OWNER (los OWNERs no pueden ser actualizados como empleados)
    if (employee.role === UserRole.OWNER) {
      throw new UnauthorizedException(
        'No podés actualizar un usuario con rol OWNER',
      );
    }

    // Evitar duplicado de email si se está cambiando
    if (updateData.email && updateData.email !== employee.email) {
      await this.validateUserExistence(updateData.email, ownerProjectId);
    }

    // Preparar datos a actualizar
    const dataToUpdate: Partial<User> = {
      ...updateData,
      stripeCustomerId: null,
    };

    // Hashear password si viene
    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }

    // Actualizar empleado
    await this.authRepository.update(employeeId, dataToUpdate);

    return {
      success: true,
      message: 'Empleado actualizado correctamente',
    };
  }

  async updateOwnProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { password, ...updateData } = updateProfileDto;

    // Buscar el usuario
    const user = await this.authRepository.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Evitar duplicado de email si se está cambiando
    if (updateData.email && updateData.email !== user.email) {
      await this.validateUserExistence(updateData.email, user.projectId);
    }

    // Preparar datos a actualizar
    const dataToUpdate: Partial<User> = { ...updateData };

    // Hashear password si viene
    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
      // Logging de cambio de contraseña
      this.logger.warn(
        `🔐 Cambio de contraseña: ${user.email} | UserId: ${userId}`,
      );
    }

    // Actualizar usuario
    await this.authRepository.update(userId, dataToUpdate);

    // Logging de actualización de perfil
    this.logger.log(`📝 Perfil actualizado: ${user.email} | UserId: ${userId}`);

    return {
      success: true,
      message: 'Perfil actualizado correctamente',
    };
  }

  async verifyCode(code: string) {
    // Buscar el código de verificación
    const verificationCode = await this.verificationCodeRepository.findOne({
      where: {
        code,
        isUsed: false,
      },
    });

    if (!verificationCode) {
      throw new BadRequestException(
        'Código de verificación inválido o expirado',
      );
    }

    // Verificar si el código ha expirado
    if (new Date() > verificationCode.expiresAt) {
      throw new BadRequestException('El código de verificación ha expirado');
    }

    // Actualizar el usuario a verificado usando el userId del código
    await this.authRepository.update(verificationCode.userId, {
      isVerify: true,
    });

    // Eliminar el código de verificación de la base de datos
    await this.verificationCodeRepository.delete(verificationCode.id);

    return {
      success: true,
      message: 'Cuenta verificada correctamente',
    };
  }

  private generateVerificationCode(): string {
    // Código alfanumérico de 8 caracteres (criptográficamente seguro)
    // Más de 2.8 billones de combinaciones vs 1 millón del método anterior
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  async resendVerificationCode(email: string) {
    // Buscar el usuario por email
    const user = await this.authRepository.findOneBy({ email });

    // Mensaje genérico para no revelar si el email existe
    if (!user) {
      return {
        success: true,
        message:
          'Si el email existe y no está verificado, recibirás un nuevo código de verificación',
      };
    }

    // Verificar si el usuario ya está verificado
    if (user.isVerify) {
      return {
        success: true,
        message:
          'Si el email existe y no está verificado, recibirás un nuevo código de verificación',
      };
    }

    // Reenviar el código de verificación (elimina el antiguo y crea uno nuevo)
    const project = await this.ensureProjectExists(user.projectId);
    await this.createAndSendVerificationCode(
      user.id,
      user.email,
      user.fullName,
      project.name,
    );

    return {
      success: true,
      message:
        'Si el email existe y no está verificado, recibirás un nuevo código de verificación',
    };
  }

  async forgotPassword(email: string) {
    // Buscar el usuario por email
    const user = await this.authRepository.findOneBy({ email });

    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      return {
        success: true,
        message:
          'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña',
      };
    }

    // Verificar que el usuario esté verificado
    if (!user.isVerify) {
      throw new BadRequestException(
        'Debes verificar tu cuenta antes de poder restablecer la contraseña',
      );
    }

    // Generar token único y seguro
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hashear el token antes de guardarlo en la BD (seguridad adicional)
    const tokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Eliminar tokens antiguos del usuario
    await this.passwordResetRepository.delete({ userId: user.id });

    // Crear nuevo token de reset (guardamos el hash, no el token original)
    const passwordReset = this.passwordResetRepository.create({
      userId: user.id,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    });

    await this.passwordResetRepository.save(passwordReset);

    // Construir el link de reset con el token original (este se envía al usuario)
    const resetLink = `${envs.frontendUrl || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const project = await this.ensureProjectExists(user.projectId);

    // Enviar email con el link de reset
    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.fullName,
      project.name,
    );

    return {
      success: true,
      message:
        'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Hashear el token recibido para compararlo con el almacenado
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Buscar el token de reset hasheado
    const passwordReset = await this.passwordResetRepository.findOne({
      where: {
        token: tokenHash,
        isUsed: false,
      },
    });

    if (!passwordReset) {
      throw new BadRequestException(
        'Token de recuperación inválido o expirado',
      );
    }

    // Verificar si el token ha expirado
    if (new Date() > passwordReset.expiresAt) {
      throw new BadRequestException('El token de recuperación ha expirado');
    }

    // Buscar el usuario
    const user = await this.authRepository.findOneBy({
      id: passwordReset.userId,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Actualizar la contraseña del usuario
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.authRepository.update(user.id, { password: hashedPassword });

    // Marcar el token como usado
    await this.passwordResetRepository.update(passwordReset.id, {
      isUsed: true,
    });

    return {
      success: true,
      message: 'Contraseña actualizada correctamente',
    };
  }

  private async createAndSendVerificationCode(
    userId: string,
    email: string,
    fullName: string,
    projectName: string,
  ) {
    // Eliminar códigos antiguos del usuario antes de crear uno nuevo
    await this.verificationCodeRepository.delete({ userId });

    const code = this.generateVerificationCode();

    // Guardar el nuevo código en la base de datos
    const verificationCode = this.verificationCodeRepository.create({
      userId,
      code,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
    });

    await this.verificationCodeRepository.save(verificationCode);

    // Enviar el email con el código y el projectId
    await this.mailService.sendVerificationEmail(email, code, fullName, projectName);
  }

  private async validateUserExistence(
    email: string,
    projectId: string,
  ): Promise<void> {
    const userExist = await this.authRepository.findOneBy({
      email,
      projectId,
    });
    if (userExist) {
      throw new ConflictException(
        `El usuario con email: ${email} ya existe en este proyecto.`,
      );
    }
  }

  private async ensureProjectExists(projectId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { uuid: projectId },
    });

    if (!project) {
      throw new BadRequestException(
        `El proyecto con id ${projectId} no existe. Crea el proyecto antes de agregar usuarios.`,
      );
    }

    return project;
  }

  private getProjectTrialSubscription(): {
    subscriptionType: SubscriptionType;
    subscriptionExpiresAt: Date;
  } {
    const trialDays = 15;
    return {
      subscriptionType: SubscriptionType.PRO,
      subscriptionExpiresAt: new Date(
        Date.now() + trialDays * 24 * 60 * 60 * 1000,
      ),
    };
  }

  private async enforceSubscription(user: User): Promise<Project | null> {
    const project = await this.projectRepository.findOne({
      where: { uuid: user.projectId },
    });

    if (!project) {
      this.logger.warn(
        `⚠️ Proyecto no encontrado para usuario ${user.email} | ProjectId: ${user.projectId}`,
      );
      return null;
    }

    if (this.isDevProEmail(user.email)) {
      if (
        project.subscriptionType !== SubscriptionType.PRO ||
        project.subscriptionExpiresAt !== null
      ) {
        await this.projectRepository.update(
          { uuid: project.uuid },
          {
            subscriptionType: SubscriptionType.PRO,
            subscriptionExpiresAt: null,
          },
        );

        project.subscriptionType = SubscriptionType.PRO;
        project.subscriptionExpiresAt = null;

        this.logger.log(
          `🧪 PRO de prueba aplicado al proyecto ${project.name} por email autorizado: ${user.email}`,
        );
      }
      return project;
    }

    if (
      project.subscriptionType !== SubscriptionType.FREE &&
      project.subscriptionExpiresAt &&
      project.subscriptionExpiresAt.getTime() < Date.now()
    ) {
      await this.projectRepository.update(
        { uuid: project.uuid },
        {
          subscriptionType: SubscriptionType.FREE,
          subscriptionExpiresAt: null,
        },
      );

      project.subscriptionType = SubscriptionType.FREE;
      project.subscriptionExpiresAt = null;

      this.logger.log(
        `ℹ️ Suscripción del proyecto ${project.name} expirada. Ahora es FREE | ProjectId: ${project.uuid}`,
      );
    }

    return project;
  }

  private isDevProEmail(email: string): boolean {
    return this.devProEmails.has(email.toLowerCase());
  }

  private buildProjectNameFromUser(
    fullName: string | undefined,
    email: string,
  ): string {
    const base = (fullName || email || 'project')
      .toString()
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const suffix = uuidv4().slice(0, 6);
    return `${base || 'project'}-${suffix}`;
  }

  private async validateOwnerEmailUnique(email: string): Promise<void> {
    const userExist = await this.authRepository.findOneBy({ email });
    if (userExist) {
      throw new ConflictException(`El email ${email} ya está registrado.`);
    }
  }

  private getJwtToken(payload: {
    id: string;
    role: string;
    projectId: string;
    email: string;
  }) {
    const token = this.jwtService.sign(payload, {
      secret: envs.jwtSecret,
      expiresIn: '1d',
    });
    return token;
  }

  private sanitizeUser(user: User) {
    const { password, createdAt, updatedAt, dni, projectId, ...safeUser } =
      user;

    const cleanedUser = Object.fromEntries(
      Object.entries(safeUser).filter(([_, v]) => v != null),
    );

    return cleanedUser;
  }

  private sanitizeUserForProfile(user: User) {
    const { password, projectId, ...rest } = user;
    return rest;
  }

  private getClientInfo(): string {
    // Placeholder para información del cliente (se puede expandir con IP real)
    return 'N/A';
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const MAX_ATTEMPTS = 5;
    const LOCK_TIME_MINUTES = 30;

    const newAttempts = user.failedLoginAttempts + 1;

    if (newAttempts >= MAX_ATTEMPTS) {
      // Bloquear cuenta por 30 minutos
      const lockUntil = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);

      await this.authRepository.update(user.id, {
        failedLoginAttempts: newAttempts,
        lockUntil,
      });

      this.logger.warn(
        `🔒 Cuenta bloqueada por ${LOCK_TIME_MINUTES} minutos: ${user.email} | ${newAttempts} intentos fallidos`,
      );
    } else {
      await this.authRepository.update(user.id, {
        failedLoginAttempts: newAttempts,
      });

      this.logger.warn(
        `⚠️ Intento fallido ${newAttempts}/${MAX_ATTEMPTS}: ${user.email}`,
      );
    }
  }

  // ==================== REFRESH TOKENS ====================

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');

    const refreshToken = this.refreshTokenRepository.create({
      userId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
    });

    await this.refreshTokenRepository.save(refreshToken);

    return token;
  }

  async refreshTokens(oldRefreshToken: string) {
    // Buscar el refresh token
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: oldRefreshToken, isRevoked: false },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Verificar si expiró
    if (new Date() > refreshToken.expiresAt) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Buscar el usuario
    const user = await this.authRepository.findOneBy({
      id: refreshToken.userId,
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Revocar el refresh token anterior (rotación)
    const newRefreshToken = await this.generateRefreshToken(user.id);

    await this.refreshTokenRepository.update(refreshToken.id, {
      isRevoked: true,
      replacedByToken: newRefreshToken,
    });

    // Generar nuevo access token
    const accessToken = this.getJwtToken({
      id: user.id,
      role: user.role,
      projectId: user.projectId,
      email: user.email,
    });

    this.logger.log(
      `🔄 Tokens refrescados: ${user.email} | UserId: ${user.id}`,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ==================== JWT BLACKLIST ====================

  async logout(token: string, userId: string) {
    // Decodificar el token para obtener su expiración
    const decoded = this.jwtService.decode(token) as any;

    if (!decoded || !decoded.exp) {
      throw new BadRequestException('Token inválido');
    }

    const expiresAt = new Date(decoded.exp * 1000);

    // Agregar a la blacklist
    const blacklistedToken = this.tokenBlacklistRepository.create({
      token,
      userId,
      expiresAt,
      reason: 'logout',
    });

    await this.tokenBlacklistRepository.save(blacklistedToken);

    // Revocar todos los refresh tokens del usuario
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );

    this.logger.log(`👋 Logout exitoso: UserId: ${userId}`);

    return {
      success: true,
      message: 'Logout exitoso',
    };
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const blacklisted = await this.tokenBlacklistRepository.findOne({
      where: { token },
    });

    return !!blacklisted;
  }

  // Limpieza automática de tokens expirados de la blacklist
  // Ejecutar limpieza diaria a las 3:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredBlacklistedTokens() {
    const deleted = await this.tokenBlacklistRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    this.logger.log(
      `🧹 Tokens expirados eliminados de blacklist: ${deleted.affected || 0}`,
    );
  }

  // Limpieza automática de refresh tokens expirados
  // Ejecutar limpieza diaria a las 3:30 AM
  @Cron('30 3 * * *')
  async cleanupExpiredRefreshTokens() {
    const deleted = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    this.logger.log(
      `🧹 Refresh tokens expirados eliminados: ${deleted.affected || 0}`,
    );
  }

  // ==================== TWO-FACTOR AUTHENTICATION ====================

  async enable2FA(userId: string) {
    const user = await this.authRepository.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA ya está habilitado');
    }

    // Generar secret
    const secret = authenticator.generateSecret();

    // Generar códigos de recuperación (8 códigos de 8 caracteres)
    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );

    // Guardar secret y recovery codes
    await this.authRepository.update(userId, {
      twoFactorSecret: secret,
      twoFactorRecoveryCodes: recoveryCodes,
    });

    // Generar QR code
    const otpauthUrl = authenticator.keyuri(user.email, 'IDP-Core', secret);

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    this.logger.log(
      `🔐 2FA habilitado para: ${user.email} | UserId: ${userId}`,
    );

    return {
      secret,
      qrCode: qrCodeDataUrl,
      recoveryCodes,
      message:
        'Escanea el código QR con tu app de autenticación (Google Authenticator, Authy, etc.)',
    };
  }

  async verify2FA(userId: string, token: string) {
    const user = await this.authRepository.findOneBy({ id: userId });

    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no está configurado');
    }

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      // Verificar si es un código de recuperación
      if (user.twoFactorRecoveryCodes?.includes(token)) {
        // Remover el código de recuperación usado
        const updatedCodes = user.twoFactorRecoveryCodes.filter(
          (code) => code !== token,
        );

        await this.authRepository.update(userId, {
          twoFactorRecoveryCodes: updatedCodes,
        });

        this.logger.warn(
          `⚠️ Código de recuperación usado: ${user.email} | Quedan ${updatedCodes.length} códigos`,
        );

        return { valid: true, recoveryCodeUsed: true };
      }

      throw new UnauthorizedException('Código 2FA inválido');
    }

    // Activar 2FA si es la primera verificación
    if (!user.twoFactorEnabled) {
      await this.authRepository.update(userId, {
        twoFactorEnabled: true,
      });

      this.logger.log(
        `✅ 2FA activado y verificado: ${user.email} | UserId: ${userId}`,
      );
    }

    return { valid: true, recoveryCodeUsed: false };
  }

  async disable2FA(userId: string, token: string) {
    const user = await this.authRepository.findOneBy({ id: userId });

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('2FA no está habilitado');
    }

    // Verificar el código antes de deshabilitar
    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret || '',
    });

    if (!isValid) {
      throw new UnauthorizedException(
        'Código 2FA inválido. No se puede deshabilitar.',
      );
    }

    // Deshabilitar 2FA
    await this.authRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: undefined,
      twoFactorRecoveryCodes: undefined,
    });

    this.logger.warn(`🔓 2FA deshabilitado: ${user.email} | UserId: ${userId}`);

    return {
      success: true,
      message: '2FA deshabilitado correctamente',
    };
  }

  async verify2FALogin(tempToken: string, code: string) {
    // Decodificar y validar el token temporal
    let decoded: any;
    try {
      decoded = this.jwtService.verify(tempToken);
    } catch (error) {
      throw new UnauthorizedException(
        'Token temporal inválido o expirado. Inicia sesión nuevamente.',
      );
    }

    // Verificar que sea un token temporal de 2FA
    if (!decoded.temp2FA) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.authRepository.findOneBy({ id: decoded.id });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no está configurado correctamente');
    }

    // Verificar el código 2FA
    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      // Verificar si es un código de recuperación
      if (user.twoFactorRecoveryCodes?.includes(code)) {
        // Remover el código de recuperación usado
        const updatedCodes = user.twoFactorRecoveryCodes.filter(
          (recoveryCode) => recoveryCode !== code,
        );

        await this.authRepository.update(user.id, {
          twoFactorRecoveryCodes: updatedCodes,
        });

        this.logger.warn(
          `⚠️ Código de recuperación usado en login: ${user.email} | Quedan ${updatedCodes.length} códigos`,
        );
      } else {
        this.logger.warn(
          `🚫 Código 2FA inválido en login: ${user.email} | UserId: ${user.id}`,
        );
        throw new UnauthorizedException('Código 2FA inválido');
      }
    }

    // Actualizar último login y resetear intentos fallidos
    await this.authRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockUntil: undefined,
      lastLogin: new Date(),
    });

    // Generar tokens definitivos
    const token = this.getJwtToken({
      id: user.id,
      role: user.role,
      projectId: user.projectId,
      email: user.email,
    });

    const refreshToken = await this.generateRefreshToken(user.id);

    this.logger.log(
      `✅ Login 2FA completado: ${user.email} | UserId: ${user.id} | Rol: ${user.role}`,
    );

    return {
      token,
      refreshToken,
      user: this.sanitizeUser(user),
      projectId: user.projectId,
    };
  }
}
