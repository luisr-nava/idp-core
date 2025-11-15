import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User, UserRole } from './entities/user.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { In, Repository } from 'typeorm';
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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly authRepository: Repository<User>,
    @InjectRepository(VerificationCode)
    private readonly verificationCodeRepository: Repository<VerificationCode>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}
  async createUser(createUserDto: CreateUserDto) {
    const { password, ...user } = createUserDto;

    // Generar projectId si es OWNER y no tiene uno
    let projectId = user.projectId;
    if (user.role === UserRole.OWNER && !projectId) {
      projectId = uuidv4();
    }

    // Validar que el email no exista (para OWNER, validar globalmente; para EMPLOYEE, validar por proyecto)
    if (user.role === UserRole.OWNER) {
      await this.validateOwnerEmailUnique(user.email);
    } else if (projectId) {
      await this.validateUserExistence(user.email, projectId);
    }

    const newUser = this.authRepository.create({
      ...user,
      projectId,
      password: bcrypt.hashSync(password, 10),
    });

    await this.authRepository.save(newUser);

    // Enviar email de verificación con el projectId
    await this.createAndSendVerificationCode(
      newUser.id,
      newUser.email,
      newUser.fullName,
      newUser.projectId,
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

    if (!user) {
      throw new UnauthorizedException(`El usuario con el email ${email} no existe`);
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('La contraseña es incorrecta');
    }

    // Verificar si el usuario ha verificado su cuenta
    if (!user.isVerify) {
      throw new UnauthorizedException('Debes verificar tu cuenta antes de iniciar sesión. Revisa tu email para obtener el código de verificación');
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

  async googleAuth(googleUser: any) {
    // Buscar si el usuario ya existe por email
    let user = await this.authRepository.findOneBy({
      email: googleUser.email,
    });

    // Si el usuario no existe, crearlo con nuevo projectId
    if (!user) {
      const projectId = uuidv4(); // Generar nuevo projectId

      const newUser = this.authRepository.create({
        email: googleUser.email,
        fullName: googleUser.fullName,
        password: bcrypt.hashSync(Math.random().toString(36), 10), // Password aleatorio
        role: UserRole.OWNER,
        projectId,
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
    const { password, projectId, ...user } = updateUserDto;
    const errors: string[] = [];

    const existingUser = await this.authRepository.findOneBy({ id });

    if (!existingUser) {
      return { success: false, errors: ['Usuario no encontrado.'] };
    }

    // Evitar duplicado de email
    if (user.email && user.email !== existingUser.email) {
      await this.validateUserExistence(
        user.email,
        existingUser.projectId,
      );
    }

    // Hashear password si viene
    const updatedData: UpdateUserDto = { ...user };
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
    const { password, ...updateData } = updateUserDto;
    const errors: string[] = [];

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
      await this.validateUserExistence(
        updateData.email,
        ownerProjectId,
      );
    }

    // Preparar datos a actualizar
    const dataToUpdate: Partial<User> = { ...updateData };

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
    const errors: string[] = [];

    // Buscar el usuario
    const user = await this.authRepository.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Evitar duplicado de email si se está cambiando
    if (updateData.email && updateData.email !== user.email) {
      await this.validateUserExistence(
        updateData.email,
        user.projectId,
      );
    }

    // Preparar datos a actualizar
    const dataToUpdate: Partial<User> = { ...updateData };

    // Hashear password si viene
    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }

    // Actualizar usuario
    await this.authRepository.update(userId, dataToUpdate);

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
    await this.authRepository.update(verificationCode.userId, { isVerify: true });

    // Eliminar el código de verificación de la base de datos
    await this.verificationCodeRepository.delete(verificationCode.id);

    return {
      success: true,
      message: 'Cuenta verificada correctamente',
    };
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async resendVerificationCode(email: string) {
    // Buscar el usuario por email
    const user = await this.authRepository.findOneBy({ email });

    if (!user) {
      throw new NotFoundException(`El usuario con el email ${email} no existe`);
    }

    // Verificar si el usuario ya está verificado
    if (user.isVerify) {
      throw new BadRequestException('Tu cuenta ya está verificada');
    }

    // Reenviar el código de verificación (elimina el antiguo y crea uno nuevo)
    await this.createAndSendVerificationCode(
      user.id,
      user.email,
      user.fullName,
      user.projectId,
    );

    return {
      success: true,
      message: 'Se ha enviado un nuevo código de verificación a tu email',
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

    // Eliminar tokens antiguos del usuario
    await this.passwordResetRepository.delete({ userId: user.id });

    // Crear nuevo token de reset
    const passwordReset = this.passwordResetRepository.create({
      userId: user.id,
      token: resetToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    });

    await this.passwordResetRepository.save(passwordReset);

    // Construir el link de reset (esto debería venir de la configuración del frontend)
    const resetLink = `${envs.frontendUrl || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Enviar email con el link de reset
    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.fullName,
      user.projectId,
    );

    return {
      success: true,
      message:
        'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Buscar el token de reset
    const passwordReset = await this.passwordResetRepository.findOne({
      where: {
        token,
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
    projectId: string,
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
    await this.mailService.sendVerificationEmail(email, code, fullName, projectId);
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
      throw new ConflictException(`El usuario con email: ${email} ya existe en este proyecto.`);
    }
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
}
