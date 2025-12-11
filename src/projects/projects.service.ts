import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProjectDto } from './dto/create-project.dto';
import { Project } from './entities/project.entity';
import { SubscriptionType } from '@/auth/entities/user.entity';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
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
