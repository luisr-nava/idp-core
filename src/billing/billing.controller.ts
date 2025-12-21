import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from '@/billing/billing.service';
import { CreateCheckoutSessionDto } from '@/billing/dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from '@/billing/dto/create-portal-session.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { User, UserRole } from '@/auth/entities/user.entity';
import { GetUser } from '@/auth/decorators/get-user.decorators';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Post('checkout')
  createCheckoutSession(
    @GetUser() owner: User,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(owner, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Post('portal')
  createPortalSession(
    @GetUser() owner: User,
    @Body() dto: CreatePortalSessionDto,
  ) {
    return this.billingService.createPortalSession(owner, dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() req: any,
  ) {
    const rawBody: Buffer = req.rawBody || req.body;
    return this.billingService.handleWebhook(signature, rawBody);
  }
}
