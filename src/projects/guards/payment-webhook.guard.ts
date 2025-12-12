import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { envs } from '@/config';

@Injectable()
export class PaymentWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headerName = envs.paymentWebhookHeader?.toLowerCase() || 'x-webhook-secret';
    const provided =
      (request.headers[headerName] as string) ||
      (request.headers['x-payment-secret'] as string) ||
      (request.headers['x-webhook-secret'] as string);

    if (!envs.paymentWebhookSecret) {
      throw new ForbiddenException('PAYMENT_WEBHOOK_SECRET no está configurado');
    }

    if (!provided || provided !== envs.paymentWebhookSecret) {
      throw new ForbiddenException('Firma de webhook inválida');
    }

    return true;
  }
}
