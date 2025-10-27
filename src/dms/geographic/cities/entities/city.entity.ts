import { Entity, Column, ManyToOne, ManyToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../utils/base_utils/entities/baseEntity';
import { Region } from '../../regions/entities/region.entity';
import { Country } from '../../countries/entities/country.entity';
import { Route } from '../../routes/entities/route.entity';

@Entity('cities')
@Index('idx_city_name', ['name'])
@Index('idx_city_region', ['region_id'])
@Index('idx_city_country', ['country_id'])
export class City extends BaseEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 10, nullable: true })
  code: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  // Foreign Keys
  @Column()
  region_id: number;

  @Column()
  country_id: number;

  // Relationships
  @ManyToOne(() => Region, region => region.cities, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'region_id' })
  region: Region;

  @ManyToOne(() => Country, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'country_id' })
  country: Country;

  @ManyToMany(() => Route, route => route.cities)
  routes: Route[];
}
