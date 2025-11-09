import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User, UserRole } from './entities/user.entity';
import { In, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserDto } from './dto/update-user.dto';
import { envs } from '@/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly authRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}
  async createUser(createUserDto: CreateUserDto) {
    const { password, ...user } = createUserDto;

    let errors: string[] = [];

    await this.validateUserExistence(user.email, user.projectId, errors);

    const createUser = this.authRepository.create({
      ...user,
      password: bcrypt.hashSync(password, 10),
    });

    await this.authRepository.save(createUser);
    // TODO: create sendEmail
    return {
      message: 'Usuario creado correctamente',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password, projectId } = loginDto;

    const user = await this.authRepository.findOneBy({
      email,
      projectId,
    });
    let errors: string[] = [];
    if (!user) {
      errors.push(`El usuario con el ${email} no existe`);
      throw new UnauthorizedException(errors);
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);

    if (!isPasswordValid) {
      errors.push(`La contraseña es incorrecta`);
      throw new UnauthorizedException(errors);
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
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    let errors: string[] = [];
    const { password, ...user } = updateUserDto;

    if ('projectId' in user) {
      delete user.projectId;
    }

    const existingUser = await this.authRepository.findOneBy({
      id,
      projectId: user.projectId,
    });

    if (!existingUser) {
      return { success: false, errors: ['Usuario no encontrado.'] };
    }

    if (user.email && user.email !== existingUser.email) {
      await this.validateUserExistence(
        user.email,
        existingUser.projectId,
        errors,
      );
    }

    let updatedData: UpdateUserDto = { ...user };

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updatedData.password = hashedPassword;
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
        isActive: true,
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

  private async validateUserExistence(
    email: string,
    projectId: string,
    errors: string[],
  ): Promise<void> {
    const userExist = await this.authRepository.findOneBy({
      email,
      projectId,
    });
    if (userExist) {
      errors.push(`El usuario con email: ${email} ya existe.`);
      throw new ConflictException(errors);
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
