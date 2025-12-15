import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JobsService } from '../jobs.service';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApplicationStatus } from './entities/job-application.entity';

@Controller('applications')
export class JobApplicationsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * GET /applications - Get all applications with filtering
   */
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('jobId') jobId?: string,
    @Query('status') status?: ApplicationStatus,
    @Query('search') search?: string,
    @Res() res?: Response,
  ) {
    try {
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;

      const result = await this.jobsService.findAllApplications(pageNum, limitNum, {
        jobId: jobId ? +jobId : undefined,
        status,
        search,
      });

      if (res) {
        return res.status(HttpStatus.OK).json({
          success: true,
          data: result,
        });
      }

      return result;
    } catch (error) {
      if (res) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
          data: null,
        });
      }
      throw error;
    }
  }

  /**
   * GET /applications/:id - Get single application details
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const application = await this.jobsService.findOneApplication(+id);
      return res.status(HttpStatus.OK).json({
        success: true,
        data: application,
      });
    } catch (error) {
      const status =
        error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  /**
   * PATCH /applications/:id/status - Update application status
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateApplicationStatusDto,
    @Res() res: Response,
  ) {
    try {
      const application = await this.jobsService.updateApplicationStatus(+id, updateDto, null);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Application status updated successfully',
        data: application,
      });
    } catch (error) {
      const status =
        error.message.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }
}

