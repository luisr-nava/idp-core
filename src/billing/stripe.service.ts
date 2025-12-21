import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { envs } from '@/config';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;

  constructor() {
    if (!envs.stripeApiKey) {
      this.logger.warn('⚠️ STRIPE_API_KEY no configurado. Stripe deshabilitado.');
      this.client = null;
    } else {
      // Usamos la apiVersion por defecto del SDK stripe@17 para evitar incompatibilidades.
      this.client = new Stripe(envs.stripeApiKey);
    }
  }

  private ensureClient(): Stripe {
    if (!this.client) {
      throw new Error('Stripe no está configurado (falta STRIPE_API_KEY).');
    }
    return this.client;
  }

  async createCustomer(params: Stripe.CustomerCreateParams) {
    return this.ensureClient().customers.create(params);
  }

  async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
    return this.ensureClient().checkout.sessions.create(params);
  }

  async createPortalSession(params: Stripe.BillingPortal.SessionCreateParams) {
    return this.ensureClient().billingPortal.sessions.create(params);
  }

  async retrieveSubscription(subscriptionId: string) {
    return this.ensureClient().subscriptions.retrieve(subscriptionId);
  }

  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!envs.stripeWebhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET no está configurado');
    }
    if (!signature) {
      throw new Error('Firma de Stripe ausente');
    }
    return this.ensureClient().webhooks.constructEvent(
      rawBody,
      signature,
      envs.stripeWebhookSecret,
    );
  }
}
