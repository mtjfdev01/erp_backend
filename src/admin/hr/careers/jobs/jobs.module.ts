import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { JobApplicationsController } from './job-applications/job-applications.controller';
import { Job } from './entities/job.entity';
import { JobApplication } from './job-applications/entities/job-application.entity';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, JobApplication]),
    EmailModule,
  ],
  controllers: [JobsController, JobApplicationsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
