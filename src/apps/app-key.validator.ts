import { Injectable, UnauthorizedException } from '@nestjs/common';
import { envs } from '@/config';

@Injectable()
export class AppKeyValidator {
  private readonly allowed = new Set(envs.allowedAppKeys);

  constructor() {
    if (!this.allowed.size) {
      throw new Error(
        'ALLOWED_APP_KEYS no puede estar vacío. Define al menos una appKey permitida.',
      );
    }
  }

  validate(appKey: string): string {
    if (!appKey) {
      throw new UnauthorizedException('appKey es requerido');
    }

    const normalized = appKey.trim().toLowerCase();

    if (!this.allowed.has(normalized)) {
      throw new UnauthorizedException('appKey no permitido');
    }

    return normalized;
  }
}
