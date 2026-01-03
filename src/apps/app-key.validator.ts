import { Injectable, UnauthorizedException } from '@nestjs/common';
import { envs } from '@/config';

@Injectable()
export class AppKeyValidator {
  private readonly allowed = new Set(envs.allowedAppKeys);
  private readonly defaultAppKey = envs.defaultAppKey;

  constructor() {
    if (!this.allowed.size) {
      throw new Error(
        'ALLOWED_APP_KEYS no puede estar vacío. Define al menos una appKey permitida.',
      );
    }
  }

  private resolveAppKey(appKey?: string): string | null {
    if (appKey && appKey.trim()) {
      return appKey;
    }
    return this.defaultAppKey;
  }

  validate(appKey?: string): string {
    const candidate = this.resolveAppKey(appKey);
    if (!candidate) {
      throw new UnauthorizedException('appKey es requerido');
    }

    const normalized = candidate.trim().toLowerCase();

    if (!this.allowed.has(normalized)) {
      throw new UnauthorizedException('appKey no permitido');
    }

    return normalized;
  }
}
