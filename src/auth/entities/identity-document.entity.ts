import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DocumentType {
  DNI = 'DNI',
  PASSPORT = 'PASSPORT',
  NATIONAL_ID = 'NATIONAL_ID',
  OTHER = 'OTHER',
}

@Entity('identity_document')
@Index(['countryCode', 'documentType', 'documentNumber'], { unique: true })
export class IdentityDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ length: 2 })
  countryCode: string;

  @Column({ type: 'enum', enum: DocumentType })
  documentType: DocumentType;

  // Se almacena normalizado (hash) para evitar exponer el valor original
  @Column({ length: 128 })
  documentNumber: string;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
