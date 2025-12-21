import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '@/auth/entities/user.entity';
import { CreateCheckoutSessionDto } from '@/billing/dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from '@/billing/dto/create-portal-session.dto';
import { StripeService } from '@/billing/stripe.service';
import { SubscriptionService } from '@/billing/subscription.service';
import Stripe from 'stripe';
import { AppKeyValidator } from '@/apps/app-key.validator';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
    private readonly appKeyValidator: AppKeyValidator,
  ) {}

  async createCheckoutSession(owner: User, dto: CreateCheckoutSessionDto) {
    this.ensureOwner(owner);
    const appKey = this.appKeyValidator.validate(dto.appKey);
    await this.subscriptionService.ensureApp(appKey);

    let stripeCustomerId = owner.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripeService.createCustomer({
        email: owner.email,
        name: owner.fullName,
        metadata: { ownerId: owner.id },
      });
      stripeCustomerId = customer.id;
      await this.userRepository.update(owner.id, {
        stripeCustomerId: stripeCustomerId,
      });
      this.logger.log(`👤 Stripe customer creado para owner ${owner.id}`);
    }

    const session = await this.stripeService.createCheckoutSession({
      mode: 'subscription',
      customer: stripeCustomerId,
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      line_items: [
        {
          price: dto.priceId,
          quantity: 1,
        },
      ],
      metadata: {
        ownerId: owner.id,
        appKey,
      },
      subscription_data: {
        metadata: {
          ownerId: owner.id,
          appKey,
        },
      },
    });

    if (!session.url) {
      throw new Error('Stripe no devolvió URL de checkout');
    }

    return { url: session.url };
  }

  async createPortalSession(owner: User, dto: CreatePortalSessionDto) {
    this.ensureOwner(owner);

    let stripeCustomerId = owner.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripeService.createCustomer({
        email: owner.email,
        name: owner.fullName,
        metadata: { ownerId: owner.id },
      });
      stripeCustomerId = customer.id;
      await this.userRepository.update(owner.id, {
        stripeCustomerId: stripeCustomerId,
      });
      this.logger.log(`👤 Stripe customer creado para owner ${owner.id}`);
    }

    const portalSession = await this.stripeService.createPortalSession({
      customer: stripeCustomerId,
      return_url: dto.returnUrl || undefined,
    });

    return { url: portalSession.url };
  }

  async handleWebhook(signature: string | undefined, rawBody: Buffer) {
    const event = this.stripeService.constructEvent(rawBody, signature);
    this.logger.log(`📩 Evento Stripe recibido: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        this.logger.verbose(`Evento no manejado: ${event.type}`);
    }

    return { received: true };
  }

  private ensureOwner(user: User) {
    if (user.role !== UserRole.OWNER) {
      throw new UnauthorizedException('Solo OWNER puede operar Stripe');
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const ownerId = session.metadata?.ownerId;
    const appKey = session.metadata?.appKey;
    const normalizedAppKey = appKey
      ? this.subscriptionService.normalizeAppKey(appKey)
      : null;
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!ownerId || !normalizedAppKey || !stripeSubscriptionId) {
      this.logger.warn(
        `checkout.session.completed sin metadata obligatoria (ownerId/appKey/subscriptionId). sessionId=${session.id}`,
      );
      return;
    }

    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (!owner) {
      this.logger.warn(`Owner ${ownerId} no encontrado para webhook Stripe`);
      return;
    }

    if (!owner.stripeCustomerId && session.customer) {
      await this.userRepository.update(owner.id, {
        stripeCustomerId: session.customer as string,
      });
    }

    let stripeSubscription: Stripe.Subscription | null = null;
    try {
      stripeSubscription = await this.stripeService.retrieveSubscription(
        stripeSubscriptionId,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo recuperar la suscripción ${stripeSubscriptionId} desde Stripe`,
        (error as Error).stack,
      );
    }

    const priceId =
      stripeSubscription?.items?.data?.[0]?.price?.id ||
      (session.metadata?.priceId as string | undefined) ||
      null;

    await this.subscriptionService.upsertFromStripe({
      ownerId,
      stripeCustomerId: (session.customer as string) || null,
      stripeSubscriptionId,
      priceId,
      plan: this.subscriptionService.derivePlanFromPrice(priceId),
      status: this.subscriptionService.mapStripeStatus(
        stripeSubscription?.status,
      ),
      currentPeriodEnd: stripeSubscription?.current_period_end,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end ?? false,
      appKey: normalizedAppKey,
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const ownerId = subscription.metadata?.ownerId;
    const appKey = subscription.metadata?.appKey;
    const normalizedAppKey = appKey
      ? this.subscriptionService.normalizeAppKey(appKey)
      : null;

    if (!ownerId || !normalizedAppKey) {
      this.logger.warn(
        `Suscripción Stripe sin metadata requerida (ownerId/appKey): ${subscription.id}`,
      );
      return;
    }

    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (!owner) {
      this.logger.warn(
        `Owner ${ownerId} no encontrado para webhook de suscripción ${subscription.id}`,
      );
      return;
    }

    if (!owner.stripeCustomerId && subscription.customer) {
      await this.userRepository.update(owner.id, {
        stripeCustomerId: subscription.customer as string,
      });
    }

    const priceId = subscription.items?.data?.[0]?.price?.id || null;

    await this.subscriptionService.upsertFromStripe({
      ownerId,
      stripeCustomerId: (subscription.customer as string) || null,
      stripeSubscriptionId: subscription.id,
      priceId,
      plan: this.subscriptionService.derivePlanFromPrice(priceId),
      status: this.subscriptionService.mapStripeStatus(subscription.status),
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      appKey: normalizedAppKey,
    });
  }
}
