import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';
import { ProjectAdminGuard } from './guards/project-admin.guard';
import { PaymentWebhookGuard } from './guards/payment-webhook.guard';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(ProjectAdminGuard)
  create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  @Post('subscription')
  @UseGuards(PaymentWebhookGuard)
  updateSubscription(@Body() updateSubscriptionDto: UpdateSubscriptionDto) {
    return this.projectsService.updateSubscription(updateSubscriptionDto);
  }
}
