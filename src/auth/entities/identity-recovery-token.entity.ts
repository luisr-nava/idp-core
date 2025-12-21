import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('identity_recovery_token')
export class IdentityRecoveryToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ unique: true })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  isUsed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  requestIp?: string | null;

  @Column({ type: 'varchar', nullable: true })
  requestUserAgent?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
