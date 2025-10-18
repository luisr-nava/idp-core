import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly authRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}
  async createUser(createUserDto: CreateUserDto) {
    const { password, ...user } = createUserDto;

    const userExist = await this.authRepository.findOneBy({
      email: user.email,
      proyectId: user.proyectId,
    });
    let errors: string[] = [];

    if (userExist) {
      errors.push(`El usuario con el ${user.email} ya esta registrado`);
      throw new ConflictException(errors);
    }

    const createUser = this.authRepository.create({
      ...user,
      password: bcrypt.hashSync(password, 10),
    });

    await this.authRepository.save(createUser);

    return {
      message: 'Usuario creado correctamente',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password, proyectId } = loginDto;

    const user = await this.authRepository.findOneBy({
      email,
      proyectId,
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
    const token = this.getJwtToken({ id: user.id });
    return {
      token,
      user,
    };
  }

  private getJwtToken(payload: { id: string }) {
    const token = this.jwtService.sign(payload, {
      expiresIn: '1d',
    });
    return token;
  }
}
