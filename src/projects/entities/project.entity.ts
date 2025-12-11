import { SubscriptionType } from '@/auth/entities/user.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('project')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ unique: true })
  @Index('idx_project_name', { unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: SubscriptionType,
    default: SubscriptionType.FREE,
  })
  subscriptionType: SubscriptionType;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiresAt?: Date | null;
}
