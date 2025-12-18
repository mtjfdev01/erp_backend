import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { Column, Entity } from "typeorm";

@Entity('volunteers')
export class Volunteer extends BaseEntity{ 
    @Column({ type: 'varchar', nullable: true, default: null })
    name: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    email: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    phone: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    category: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    availability: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    schedule: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    comments: string;

    @Column({ type: 'varchar', nullable: true, default: null })
    source: string;

}
