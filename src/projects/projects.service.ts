import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProjectDto } from './dto/create-project.dto';
import { Project } from './entities/project.entity';
import { SubscriptionType, User } from '@/auth/entities/user.entity';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createProjectDto: CreateProjectDto) {
    const existingProject = await this.projectRepository.findOne({
      where: { name: createProjectDto.name },
    });

    if (existingProject) {
      throw new ConflictException(
        `Ya existe un proyecto con el nombre: ${createProjectDto.name}`,
      );
    }

    const trial = this.getProjectTrialSubscription();
    const project = this.projectRepository.create({
      name: createProjectDto.name,
      ...trial,
    });

    const savedProject = await this.projectRepository.save(project);

    this.logger.log(
      `✅ Proyecto creado: ${savedProject.name} | ProjectId: ${savedProject.uuid}`,
    );

    return {
      uuid: savedProject.uuid,
      name: savedProject.name,
    };
  }

  async updateSubscription(dto: UpdateSubscriptionDto) {
    const project = await this.projectRepository.findOne({
      where: { uuid: dto.projectId },
    });

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const expiresAt =
      dto.durationDays !== undefined
        ? new Date(Date.now() + dto.durationDays * 24 * 60 * 60 * 1000)
        : dto.expiresAt
          ? new Date(dto.expiresAt)
          : null;

    project.subscriptionType = dto.subscriptionType;
    project.subscriptionExpiresAt = expiresAt;

    await this.projectRepository.save(project);
    await this.userRepository.update(
      { projectId: project.uuid },
      {
        subscriptionType: project.subscriptionType,
        subscriptionExpiresAt: project.subscriptionExpiresAt,
      },
    );

    this.logger.log(
      `🔄 Suscripción actualizada: ${project.name} -> ${project.subscriptionType} (expira: ${expiresAt}) por user ${dto.userId}`,
    );

    return {
      uuid: project.uuid,
      name: project.name,
      subscriptionType: project.subscriptionType,
      subscriptionExpiresAt: project.subscriptionExpiresAt,
    };
  }

  private getProjectTrialSubscription(): {
    subscriptionType: SubscriptionType;
    subscriptionExpiresAt: Date;
  } {
    const trialDays = 15;
    return {
      subscriptionType: SubscriptionType.PRO,
      subscriptionExpiresAt: new Date(
        Date.now() + trialDays * 24 * 60 * 60 * 1000,
      ),
    };
  }
}
