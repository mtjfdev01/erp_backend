import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, HttpCode, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Controller('job_applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('cvResume'))
  async create(
    @Body() createApplicationDto: CreateApplicationDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    try {
      // For now, ignore the file since we're using dummy URL
      // File will be handled when Google Drive is implemented
      const application = await this.applicationsService.create(createApplicationDto);
      return {
        success: true,
        message: 'Application submitted successfully',
        data: application
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to submit application',
        error: error.message
      };
    }
  }

  @Get()
  findAll(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
    @Query('sortField') sortField: string = 'created_at',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    @Query('job_id') job_id?: string
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const pageSizeNum = parseInt(pageSize, 10) || 10;
    const jobId = job_id ? parseInt(job_id, 10) : undefined;
    
    return this.applicationsService.findAll(pageNum, pageSizeNum, sortField, sortOrder, jobId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.applicationsService.findOne(+id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() updateApplicationDto: UpdateApplicationDto) {
    try {
      const result = await this.applicationsService.update(+id, updateApplicationDto);
      return result;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update application',
        error: error.message
      };
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    try {
      const result = await this.applicationsService.remove(+id);
      return result;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete application',
        error: error.message
      };
    }
  }
}
