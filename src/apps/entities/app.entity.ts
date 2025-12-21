import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('app')
export class App {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  appKey: string;

  @Column({ type: 'varchar', length: 128 })
  displayName: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
