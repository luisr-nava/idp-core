import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly authRepository: Repository<User>,
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
}
