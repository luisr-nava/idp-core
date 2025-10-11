import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
@Entity('auth')
export class Auth {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  email: string;

  @Column()
  userName: string;

  @Column()
  userLastName: string;

  @Column()
  password: string;

  @Column()
  proyectId: string;
  
  @Column({ default: false })
  is_verify: boolean;
}
