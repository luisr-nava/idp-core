import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User, UserRole } from './entities/user.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { DeepPartial, In, LessThan, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MailService } from '@/mail/mail.service';
import { envs } from '@/config';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from '@/billing/subscription.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/billing/entities/subscription.entity';
import {
  DocumentType,
  IdentityDocument,
} from './entities/identity-document.entity';
import { IdentityRecoveryToken } from './entities/identity-recovery-token.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly authRepository: Repository<User>,
    @InjectRepository(VerificationCode)
    private readonly verificationCodeRepository: Repository<VerificationCode>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepository: Repository<TokenBlacklist>,
    @InjectRepository(IdentityDocument)
    private readonly identityDocumentRepository: Repository<IdentityDocument>,
    @InjectRepository(IdentityRecoveryToken)
    private readonly identityRecoveryTokenRepository: Repository<IdentityRecoveryToken>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly subscriptionService: SubscriptionService,
  ) {}
  async createUser(createUserDto: CreateUserDto & { ownerId?: string }) {
    const { password, role: roleInput, ownerId, appKey, ...user } =
      createUserDto;
    const role = this.normalizeRole(roleInput);

    const normalizedAppKey = this.subscriptionService.validateAppKey(appKey);

    // Validar que el email no exista (OWNER global, EMPLOYEE global)
    if (role === UserRole.OWNER) {
      await this.validateOwnerEmailUnique(user.email, normalizedAppKey);
    } else {
      if (!ownerId) {
        throw new BadRequestException(
          'ownerId es requerido para crear un empleado',
        );
      }
      await this.validateOwnerEmailUnique(user.email, normalizedAppKey);
    }

    const createUserPayload: DeepPartial<User> = {
      ...user,
      salary: user.salary,
      role: role ?? UserRole.OWNER,
      hireDate: user.hireDate ? new Date(user.hireDate) : undefined,
      appKey: normalizedAppKey,
      password: bcrypt.hashSync(password, 10),
    };

    const newUser = this.authRepository.create(createUserPayload);

    const savedUser = await this.authRepository.save(newUser);

    // Mantener compatibilidad: si se cargó DNI, lo registramos como identidad AR/DNI
    await this.upsertIdentityDocument(
      savedUser,
      'AR',
      DocumentType.DNI,
      user.dni,
    );

    // Enviar email de verificación
    await this.createAndSendVerificationCode(
      savedUser.id,
      savedUser.email,
      savedUser.fullName,
      'tu cuenta',
    );

    if (role === UserRole.OWNER) {
      await this.subscriptionService.getOrCreateFreeSubscription(
        savedUser.id,
        normalizedAppKey,
        savedUser.stripeCustomerId,
      );
    }

    return {
      message:
        'Usuario creado correctamente. Se ha enviado un código de verificación a tu email',
      userId: savedUser.id,
    };
  }

  private normalizeRole(role?: string): UserRole | undefined {
    if (!role) {
      return undefined;
    }

    const normalized = role.toUpperCase();
    return Object.values(UserRole).includes(normalized as UserRole)
      ? (normalized as UserRole)
      : undefined;
  }

  async login(loginDto: LoginDto) {
    const { email, password, appKey } = loginDto;

    const normalizedAppKey = this.subscriptionService.validateAppKey(appKey);

    const user = await this.authRepository.findOne({
      where: { email, appKey: normalizedAppKey },
    });

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

    // Resetear intentos fallidos y actualizar último login
    await this.authRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockUntil: undefined,
      lastLogin: new Date(),
    });

    const { ownerId, subscription } = await this.resolveSubscriptionContext(
      user,
      normalizedAppKey,
    );

    const token = this.getJwtToken({
      userId: user.id,
      role: user.role,
      ownerId,
      appKey: normalizedAppKey,
      plan: subscription?.plan ?? SubscriptionPlan.FREE,
      subscriptionStatus: subscription?.status ?? SubscriptionStatus.ACTIVE,
      email: user.email,
    });

    // Logging de login exitoso
    this.logger.log(
      `✅ Login exitoso: ${email} | UserId: ${user.id} | Rol: ${user.role} | App: ${normalizedAppKey}`,
    );

    return {
      token,
      user: this.sanitizeUser(user),
      ownerId,
      appKey: normalizedAppKey,
      plan: subscription?.plan ?? SubscriptionPlan.FREE,
      subscriptionStatus: subscription?.status ?? SubscriptionStatus.ACTIVE,
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // SEGURIDAD: Excluir campos sensibles que no deben ser actualizables directamente
    const { password, role, isVerify, ...user } = updateUserDto;

    const existingUser = await this.authRepository.findOneBy({ id });

    if (!existingUser) {
      return { success: false, errors: ['Usuario no encontrado.'] };
    }

    // Evitar duplicado de email
    if (user.email && user.email !== existingUser.email) {
      await this.validateUserExistence(user.email, existingUser.appKey);
    }

    if (password) {
      updateUserDto.password = await bcrypt.hash(password, 10);
    }

    const userUpdatePayload = {
      ...user,
      salary: user.salary,
      hireDate: this.stringifyDate(user.hireDate),
    };

    await this.authRepository.update(id, userUpdatePayload);

    return { success: true, message: 'Usuario actualizado correctamente.' };
  }

  async getUserById(id: string) {
    const user = await this.authRepository.findOneBy({ id });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return this.sanitizeUserForProfile(user);
  }

  async getEmployeesByOwner(ownerId: string) {
    const employees = await this.authRepository.find({
      where: {
        ownerId,
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
        createdAt: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (!employees.length) {
      throw new NotFoundException(
        'No se encontraron empleados para este owner',
      );
    }

    return employees;
  }

  async updateEmployee(
    employeeId: string,
    owner: User,
    updateUserDto: UpdateUserDto,
  ) {
    // SEGURIDAD: Excluir campos sensibles
    const { password, role, isVerify, ...updateData } = updateUserDto;

    // Buscar el empleado
    const employee = await this.authRepository.findOneBy({ id: employeeId });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    // Validar que el empleado pertenezca al owner
    if (employee.ownerId !== owner.id) {
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
      await this.validateUserExistence(updateData.email, employee.appKey);
    }

    // Preparar datos a actualizar
    const dataToUpdate = {
      ...updateData,
      salary: updateData.salary,
      hireDate: this.stringifyDate(updateData.hireDate),
    };

    // Hashear password si viene
    if (password) {
      updateUserDto.password = await bcrypt.hash(password, 10);
    }

    // Actualizar empleado
    await this.authRepository.update(employeeId, dataToUpdate);

    if (updateData.dni) {
      await this.upsertIdentityDocument(
        employee,
        'AR',
        DocumentType.DNI,
        updateData.dni,
      );
    }

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
      await this.validateUserExistence(updateData.email, user.appKey);
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

    if (updateData.dni) {
      await this.upsertIdentityDocument(
        user,
        'AR',
        DocumentType.DNI,
        updateData.dni,
      );
    }

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
    await this.createAndSendVerificationCode(
      user.id,
      user.email,
      user.fullName,
      'tu cuenta',
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

    // Enviar email con el link de reset
    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.fullName,
      'tu cuenta',
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

  // ==================== RECUPERACIÓN POR IDENTIDAD (security sensitive) ====================

  async recoverByIdentity(
    dto: {
      countryCode: string;
      documentType: DocumentType;
      documentNumber: string;
    },
    meta?: { ip?: string; userAgent?: string },
  ) {
    // Security-sensitive: evita enumeración devolviendo respuesta genérica
    const countryCode = this.normalizeCountryCode(dto.countryCode);
    const normalizedNumber = this.normalizeDocumentNumber(dto.documentNumber);
    const numberHash = this.hashDocumentNumber(normalizedNumber);

    const identity = await this.identityDocumentRepository.findOne({
      where: {
        countryCode,
        documentType: dto.documentType,
        documentNumber: numberHash,
      },
    });

    if (!identity) {
      this.logger.warn(
        `🔎 Recuperación por identidad sin match (${countryCode}/${dto.documentType})`,
      );
      return {
        success: true,
        message:
          'Si los datos son correctos, recibirás instrucciones en tu email',
      };
    }

    const user = await this.authRepository.findOne({
      where: { id: identity.userId },
    });

    if (!user) {
      this.logger.warn(
        `🔎 Recuperación por identidad: usuario no encontrado para doc ${identity.id}`,
      );
      return {
        success: true,
        message:
          'Si los datos son correctos, recibirás instrucciones en tu email',
      };
    }

    // Invalidar tokens previos
    await this.identityRecoveryTokenRepository.update(
      { userId: user.id, isUsed: false },
      { isUsed: true, usedAt: new Date() },
    );

    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const recoveryToken = this.identityRecoveryTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      requestIp: meta?.ip,
      requestUserAgent: meta?.userAgent,
    });

    await this.identityRecoveryTokenRepository.save(recoveryToken);

    const recoveryLink = `${envs.frontendUrl || 'http://localhost:3000'}/recover-confirm?token=${rawToken}`;

    await this.mailService.sendIdentityRecoveryEmail(
      user.email,
      recoveryLink,
      user.fullName,
      'tu cuenta',
    );

    this.logger.warn(
      `🛡️ Recuperación por identidad iniciada para user ${user.id} (${countryCode}/${dto.documentType})`,
    );

    return {
      success: true,
      message:
        'Si los datos son correctos, recibirás instrucciones en tu email',
    };
  }

  async recoverConfirm(dto: {
    token: string;
    newEmail?: string;
    newPassword?: string;
  }) {
    if (!dto.newEmail && !dto.newPassword) {
      throw new BadRequestException(
        'Debes proporcionar un nuevo email o una nueva contraseña',
      );
    }

    const tokenHash = this.hashToken(dto.token);

    const recovery = await this.identityRecoveryTokenRepository.findOne({
      where: { tokenHash, isUsed: false },
    });

    if (!recovery || recovery.expiresAt < new Date()) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.authRepository.findOne({
      where: { id: recovery.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const updates: Partial<User> = {};
    let emailChanged = false;

    if (dto.newEmail && dto.newEmail !== user.email) {
      await this.validateOwnerEmailUnique(dto.newEmail, user.appKey);
      updates.email = dto.newEmail;
      updates.isVerify = false;
      emailChanged = true;
    }

    if (dto.newPassword) {
      updates.password = await bcrypt.hash(dto.newPassword, 10);
    }

    if (Object.keys(updates).length > 0) {
      await this.authRepository.update(user.id, updates);
    }

    await this.identityRecoveryTokenRepository.update(recovery.id, {
      isUsed: true,
      usedAt: new Date(),
    });

    if (emailChanged && dto.newEmail) {
      await this.createAndSendVerificationCode(
        user.id,
        dto.newEmail,
        user.fullName,
        'tu cuenta',
      );
    }

    this.logger.log(
      `✅ Recuperación por identidad confirmada para user ${user.id} (email cambiado: ${emailChanged})`,
    );

    return {
      success: true,
      message: 'Datos actualizados. Revisa tu email para continuar',
    };
  }

  private async createAndSendVerificationCode(
    userId: string,
    email: string,
    fullName: string,
    contextName: string,
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

    // Enviar el email con el código
    await this.mailService.sendVerificationEmail(
      email,
      code,
      fullName,
      contextName,
    );
  }

  private async validateUserExistence(
    email: string,
    appKey: string,
  ): Promise<void> {
    const userExist = await this.authRepository.findOne({
      where: { email, appKey },
    });
    if (userExist) {
      throw new ConflictException(
        `El usuario con email: ${email} ya existe en esta app.`,
      );
    }
  }

  private async validateOwnerEmailUnique(
    email: string,
    appKey: string,
  ): Promise<void> {
    const userExist = await this.authRepository.findOne({
      where: { email, appKey },
    });
    if (userExist) {
      throw new ConflictException(
        `El email ${email} ya está registrado en esta app.`,
      );
    }
  }

  private getJwtToken(payload: {
    userId: string;
    role: UserRole;
    ownerId?: string | null;
    appKey: string;
    plan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    email: string;
  }) {
    const token = this.jwtService.sign(
      {
        sub: payload.userId,
        role: payload.role,
        ownerId: payload.ownerId ?? null,
        appKey: payload.appKey,
        plan: payload.plan,
        subscriptionStatus: payload.subscriptionStatus,
        email: payload.email,
      },
      {
        secret: envs.jwtSecret,
        expiresIn: '1d',
      },
    );
    return token;
  }

  private async upsertIdentityDocument(
    user: User,
    countryCode: string,
    documentType: DocumentType,
    documentNumber?: string | null,
  ) {
    if (!documentNumber) return;

    const normalizedCode = this.normalizeCountryCode(countryCode);
    const normalizedNumber = this.normalizeDocumentNumber(documentNumber);
    const numberHash = this.hashDocumentNumber(normalizedNumber);

    const existing = await this.identityDocumentRepository.findOne({
      where: {
        countryCode: normalizedCode,
        documentType,
        documentNumber: numberHash,
      },
    });

    if (existing && existing.userId !== user.id) {
      throw new ConflictException(
        'El documento ya está asociado a otro usuario',
      );
    }

    const userDoc = await this.identityDocumentRepository.findOne({
      where: { userId: user.id, countryCode: normalizedCode, documentType },
    });

    if (userDoc) {
      userDoc.documentNumber = numberHash;
      await this.identityDocumentRepository.save(userDoc);
      return;
    }

    const identity = this.identityDocumentRepository.create({
      userId: user.id,
      countryCode: normalizedCode,
      documentType,
      documentNumber: numberHash,
    });

    await this.identityDocumentRepository.save(identity);
  }

  private normalizeCountryCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private normalizeDocumentNumber(documentNumber: string): string {
    const normalized = documentNumber
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
    if (!normalized) {
      throw new BadRequestException('documentNumber no puede quedar vacío');
    }
    return normalized;
  }

  private hashDocumentNumber(normalizedDocument: string): string {
    return crypto.createHash('sha256').update(normalizedDocument).digest('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private stringifyDate(value?: Date | string | null): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value instanceof Date ? value.toISOString() : value;
  }

  private sanitizeUser(user: User) {
    const { password, createdAt, updatedAt, dni, ...safeUser } = user;

    const cleanedUser = Object.fromEntries(
      Object.entries(safeUser).filter(([_, v]) => v != null),
    );

    return cleanedUser;
  }

  private sanitizeUserForProfile(user: User) {
    const { password, ...rest } = user;
    return rest;
  }

  private async resolveSubscriptionContext(user: User, appKey: string) {
    const owner = await this.resolveOwner(user);
    await this.subscriptionService.ensureApp(appKey);

    if (user.role !== UserRole.OWNER) {
      const allowed = await this.subscriptionService.validateEmployeeAccess(
        user.id,
        owner.id,
        appKey,
      );
      if (!allowed) {
        throw new UnauthorizedException('No tienes acceso a esta app');
      }
    }

    const subscription =
      (await this.subscriptionService.findByOwnerAndApp(owner.id, appKey)) ||
      (await this.subscriptionService.getOrCreateFreeSubscription(
        owner.id,
        appKey,
        owner.stripeCustomerId,
      ));

    return { ownerId: owner.id, subscription };
  }

  private async resolveOwner(user: User): Promise<User> {
    if (user.role === UserRole.OWNER) {
      return user;
    }

    if (user.ownerId) {
      const owner = await this.authRepository.findOne({
        where: { id: user.ownerId, role: UserRole.OWNER },
      });
      if (owner) return owner;
    }

    throw new UnauthorizedException('Empleado sin OWNER asociado');
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
}
