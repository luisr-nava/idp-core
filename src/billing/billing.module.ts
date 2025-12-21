import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from '@/billing/billing.controller';
import { BillingService } from '@/billing/billing.service';
import { StripeService } from '@/billing/stripe.service';
import { SubscriptionService } from '@/billing/subscription.service';
import { Subscription } from '@/billing/entities/subscription.entity';
import { App } from '@/apps/entities/app.entity';
import { EmployeeAccess } from '@/billing/entities/employee-access.entity';
import { User } from '@/auth/entities/user.entity';
import { AppKeyValidator } from '@/apps/app-key.validator';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, App, EmployeeAccess, User])],
  controllers: [BillingController],
  providers: [BillingService, StripeService, SubscriptionService, AppKeyValidator],
  exports: [SubscriptionService],
})
export class BillingModule {}
