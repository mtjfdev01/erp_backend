import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcurementsController } from './procurements.controller';
import { ProcurementsService } from './services/procurements.service';
import { ProcurementsEntity } from './entities/procurements.entity/procurements.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProcurementsEntity])],
  controllers: [ProcurementsController],
  providers: [ProcurementsService]
})
export class ProcurementsModule {}
