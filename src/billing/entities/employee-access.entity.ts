import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('employee_access')
@Index(['employeeId', 'appKey', 'ownerId'], { unique: true })
export class EmployeeAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @Column()
  ownerId: string;

  @Column()
  appKey: string;
}
