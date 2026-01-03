import { App } from '@/apps/entities/app.entity';
import { envs } from '@/config';
import { EmployeeAccess } from '@/billing/entities/employee-access.entity';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/billing/entities/subscription.entity';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

interface SubscriptionUpsertInput {
  ownerId: string;
  appKey: string;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  priceId?: string | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly allowedAppKeys = new Set(envs.allowedAppKeys);
  private readonly defaultAppKey = envs.defaultAppKey;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(App)
    private readonly appRepository: Repository<App>,
    @InjectRepository(EmployeeAccess)
    private readonly employeeAccessRepository: Repository<EmployeeAccess>,
  ) {
    if (!this.allowedAppKeys.size) {
      throw new Error(
        'ALLOWED_APP_KEYS no puede estar vacío. Define al menos una appKey permitida.',
      );
    }
  }

  async ensureApp(appKey: string, displayName?: string): Promise<App> {
    const normalizedKey = this.validateAppKey(appKey);
    let app = await this.appRepository.findOne({
      where: { appKey: normalizedKey },
    });

    if (!app) {
      app = this.appRepository.create({
        appKey: normalizedKey,
        displayName: displayName || normalizedKey,
      });
      await this.appRepository.save(app);
      this.logger.log(`🆕 App registrada: ${normalizedKey}`);
    }

    if (!app.isActive) {
      this.logger.warn(`⚠️ App inactiva: ${normalizedKey}`);
    }

    return app;
  }

  async getOrCreateFreeSubscription(
    ownerId: string,
    appKey: string,
    stripeCustomerId?: string | null,
  ): Promise<Subscription> {
    const normalizedKey = this.validateAppKey(appKey);
    await this.ensureApp(normalizedKey);

    let subscription = await this.subscriptionRepository.findOne({
      where: { ownerId, appKey: normalizedKey },
    });

    if (!subscription) {
      subscription = this.subscriptionRepository.create({
        ownerId,
        appKey: normalizedKey,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        ...(stripeCustomerId ? { stripeCustomerId } : {}),
        cancelAtPeriodEnd: false,
      });
      await this.subscriptionRepository.save(subscription);
      this.logger.log(
        `🆓 Suscripción FREE creada para owner ${ownerId} en app ${normalizedKey}`,
      );
    }

    return subscription;
  }

  async upsertFromStripe(data: SubscriptionUpsertInput): Promise<Subscription> {
    const normalizedKey = this.normalizeAppKey(data.appKey);
    await this.ensureApp(normalizedKey);

    const existing = await this.subscriptionRepository.findOne({
      where: { ownerId: data.ownerId, appKey: normalizedKey },
    });

    const subscription = existing
      ? Object.assign(existing, {
          plan: data.plan ?? existing.plan,
          status: data.status ?? existing.status,
          ...(data.stripeCustomerId
            ? { stripeCustomerId: data.stripeCustomerId }
            : {}),
          ...(data.stripeSubscriptionId
            ? { stripeSubscriptionId: data.stripeSubscriptionId }
            : {}),
          ...(data.priceId ? { priceId: data.priceId } : {}),
          cancelAtPeriodEnd:
            data.cancelAtPeriodEnd !== undefined
              ? Boolean(data.cancelAtPeriodEnd)
              : existing.cancelAtPeriodEnd ?? false,
          ...(data.currentPeriodEnd !== undefined && data.currentPeriodEnd
            ? { currentPeriodEnd: new Date(data.currentPeriodEnd * 1000) }
            : {}),
        })
      : this.subscriptionRepository.create({
          ownerId: data.ownerId,
          appKey: normalizedKey,
          plan: data.plan ?? SubscriptionPlan.PRO,
          status: data.status ?? SubscriptionStatus.ACTIVE,
          ...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
          ...(data.stripeSubscriptionId
            ? { stripeSubscriptionId: data.stripeSubscriptionId }
            : {}),
          ...(data.priceId ? { priceId: data.priceId } : {}),
          cancelAtPeriodEnd: data.cancelAtPeriodEnd !== undefined ? Boolean(data.cancelAtPeriodEnd) : false,
          ...(data.currentPeriodEnd
            ? { currentPeriodEnd: new Date(data.currentPeriodEnd * 1000) }
            : {}),
        });

    const saved = await this.subscriptionRepository.save(subscription);
    this.logger.log(
      `🔄 Suscripción sincronizada (owner: ${data.ownerId}, app: ${normalizedKey}, status: ${saved.status}, plan: ${saved.plan})`,
    );

    return saved;
  }

  async findByOwnerAndApp(
    ownerId: string,
    appKey: string,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findOne({
      where: { ownerId, appKey: this.normalizeAppKey(appKey) },
    });
  }

  async validateEmployeeAccess(
    employeeId: string,
    ownerId: string,
    appKey: string,
  ): Promise<boolean> {
    const normalizedKey = this.normalizeAppKey(appKey);
    const accesses = await this.employeeAccessRepository.find({
      where: { employeeId },
    });

    if (!accesses.length) {
      return true; // Compatibilidad hacia atrás: si no hay registros, permitimos el acceso.
    }

    const allowed = accesses.some(
      (access) =>
        access.ownerId === ownerId &&
        this.normalizeAppKey(access.appKey) === normalizedKey,
    );

    if (!allowed) {
      this.logger.warn(
        `🚫 Acceso denegado para employee ${employeeId} en app ${normalizedKey} (owner ${ownerId})`,
      );
    }

    return allowed;
  }

  normalizeAppKey(appKey: string): string {
    return appKey.trim().toLowerCase();
  }

  private resolveAppKeyCandidate(appKey?: string): string | null {
    if (appKey && appKey.trim()) {
      return appKey;
    }
    return this.defaultAppKey;
  }

  validateAppKey(appKey?: string): string {
    const candidate = this.resolveAppKeyCandidate(appKey);
    if (!candidate) {
      throw new UnauthorizedException('appKey es requerido');
    }
    const normalized = this.normalizeAppKey(candidate);
    if (!this.allowedAppKeys.has(normalized)) {
      throw new UnauthorizedException('appKey no permitido');
    }
    return normalized;
  }

  mapStripeStatus(status?: string): SubscriptionStatus {
    switch (status) {
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  derivePlanFromPrice(priceId?: string | null): SubscriptionPlan {
    if (!priceId) {
      return SubscriptionPlan.FREE;
    }

    // Simple heuristic: PREMIUM si contiene "premium", PRO en otros casos pagados.
    const value = priceId.toLowerCase();
    if (value.includes('premium')) return SubscriptionPlan.PREMIUM;
    if (value.includes('pro')) return SubscriptionPlan.PRO;
    return SubscriptionPlan.PRO;
  }
}
