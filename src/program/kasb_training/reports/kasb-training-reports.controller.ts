import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { KasbTrainingReportsService } from './kasb-training-reports.service';
import { CreateKasbTrainingReportDto } from './dto/create-kasb-training-report.dto';
import { UpdateKasbTrainingReportDto } from './dto/update-kasb-training-report.dto';
import { JwtGuard } from 'src/auth/jwt.guard';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { User } from 'src/users/user.entity';
import { PermissionsGuard } from 'src/permissions/guards/permissions.guard';
import { RequiredPermissions } from 'src/permissions/decorators/require-permission.decorator';

@Controller('program/kasb-training/reports')
@UseGuards(JwtGuard, PermissionsGuard)
export class KasbTrainingReportsController {
  constructor(private readonly kasbTrainingReportsService: KasbTrainingReportsService) {}

  @Post()
  @RequiredPermissions(['program.kasb_training_reports.create', 'super_admin', 'programs_manager'])
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateKasbTrainingReportDto, @CurrentUser() user: User) {
    return await this.kasbTrainingReportsService.create(createDto, user);
  }

  @Get()
  @RequiredPermissions(['program.kasb_training_reports.list_view', 'super_admin', 'programs_manager', 'read_only_super_admin'])
  async findAll() {
    const reports = await this.kasbTrainingReportsService.findAll();
    return {
      success: true,
      data: reports
    };
  }

  @Get(':id')
  @RequiredPermissions(['program.kasb_training_reports.view', 'super_admin', 'programs_manager', 'read_only_super_admin'])
  async findOne(@Param('id') id: string) {
    const report = await this.kasbTrainingReportsService.findOne(+id);
    return {
      success: true,
      data: report
    };
  }

  @Patch(':id')
  @RequiredPermissions(['program.kasb_training_reports.update', 'super_admin', 'programs_manager'])
  async update(@Param('id') id: string, @Body() updateDto: UpdateKasbTrainingReportDto) {
    const report = await this.kasbTrainingReportsService.update(+id, updateDto);
    return {
      success: true,
      message: 'Kasb training report updated successfully',
      data: report
    };
  }

  @Delete(':id')
  @RequiredPermissions(['program.kasb_training_reports.delete', 'super_admin', 'programs_manager'])
  async remove(@Param('id') id: string) {
    await this.kasbTrainingReportsService.remove(+id);
    return {
      success: true,
      message: 'Kasb training report deleted successfully'
    };
  }
} 