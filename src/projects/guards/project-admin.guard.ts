import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { envs } from '@/config';

@Injectable()
export class ProjectAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const tokenHeader =
      (request.headers['x-project-admin-key'] ||
        request.headers['x-project-admin-token']) as string | undefined;
    const tokenBody =
      request.body?.projectAdminToken ||
      request.body?.PROJECT_ADMIN_TOKEN ||
      undefined;

    const allowedEmails = envs.projectAdminEmails || [];
    const adminToken = envs.projectAdminToken;
    const emailBody =
      (request.body?.projectAdminEmail ||
        request.body?.PROJECT_ADMIN_EMAIL ||
        request.body?.PROJECT_ADMIN_EMAILS ||
        '') as string;

    // Permitir con token de admin
    if (
      adminToken &&
      ((tokenHeader && tokenHeader === adminToken) ||
        (tokenBody && tokenBody === adminToken))
    ) {
      return true;
    }

    // Permitir con email listado
    const email = emailBody.toLowerCase();
    if (allowedEmails.length && email && allowedEmails.includes(email)) {
      return true;
    }

    // Sin token válido ni email permitido -> rechazar
    if (!adminToken && !allowedEmails.length) {
      throw new ForbiddenException(
        'Acceso a proyectos no configurado. Define PROJECT_ADMIN_EMAILS o PROJECT_ADMIN_TOKEN',
      );
    }

    throw new ForbiddenException('No tienes permisos para gestionar proyectos');
  }
}
