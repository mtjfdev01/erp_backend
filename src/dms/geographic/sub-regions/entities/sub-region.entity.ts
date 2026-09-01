import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "../../../../utils/base_utils/entities/baseEntity";
import { Country } from "../../countries/entities/country.entity";
import { Region } from "../../regions/entities/region.entity";
import { District } from "../../districts/entities/district.entity";

@Entity("sub_regions")
@Index("idx_sub_region_name", ["name"])
@Index("idx_sub_region_region", ["region_id"])
@Index("idx_sub_region_country", ["country_id"])
export class SubRegion extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 10, nullable: true })
  code: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column()
  region_id: number;

  @Column()
  country_id: number;

  @ManyToOne(() => Region, (region) => region.sub_regions, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "region_id" })
  region: Region;

  @ManyToOne(() => Country, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "country_id" })
  country: Country;

  @OneToMany(() => District, (district) => district.sub_region, {
    cascade: true,
  })
  districts: District[];
}
