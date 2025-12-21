import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { TokenBlacklist } from '../entities/token-blacklist.entity';
import { envs } from '@/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepository: Repository<TokenBlacklist>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: envs.jwtSecret,
      passReqToCallback: true, // Permite acceder al request en validate()
    });
  }

  async validate(
    req: any,
    payload: {
      sub: string;
      role: string;
      ownerId?: string | null;
      appKey: string;
      plan?: string;
      subscriptionStatus?: string;
    },
  ) {
    const { sub, appKey } = payload;

    // Extraer el token del header
    const token = req.headers.authorization?.replace('Bearer ', '');

    // Verificar si el token está en la blacklist
    if (token) {
      const isBlacklisted = await this.tokenBlacklistRepository.findOne({
        where: { token },
      });

      if (isBlacklisted) {
        throw new UnauthorizedException(
          'Token inválido. La sesión ha sido cerrada.',
        );
      }
    }

    if (!sub || !appKey) {
      throw new UnauthorizedException('Token inválido o incompleto');
    }

    const user = await this.userRepository.findOneBy({ id: sub });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }
}
