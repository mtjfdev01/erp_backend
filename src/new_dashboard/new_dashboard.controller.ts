import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NewDashboardService } from './new_dashboard.service';
import { ProgramApplicationOverviewQueryDto } from './dto/program-application-overview-query.dto';
import { DeliverablesOverviewQueryDto } from './dto/deliverables-overview-query.dto';
import { JwtGuard } from 'src/auth/jwt.guard';
import { PermissionsGuard } from 'src/permissions/guards/permissions.guard';
import { RequiredPermissions } from 'src/permissions/decorators/require-permission.decorator';

@Controller('new-dashboard')
@UseGuards(JwtGuard, PermissionsGuard)
export class NewDashboardController {
  constructor(private readonly newDashboardService: NewDashboardService) {}

  /**
   * Program application overview cards (same shape as frontend `dummyData.js` + Overall card).
   * Query: optional `from`, `to` (YYYY-MM-DD) on `report_date` (inclusive range when both set).
   */
  @Get('dashboard-report/program-application-overview')
  @RequiredPermissions([
    'program.application_reports.list_view',
    'super_admin',
    'programs_manager',
    'read_only_super_admin',
  ])
  async getProgramApplicationOverview(@Query() query: ProgramApplicationOverviewQueryDto) {
    const result = await this.newDashboardService.getProgramApplicationOverview(query);
    return {
      success: true,
      message: 'Program application overview retrieved successfully',
      ...result,
    };
  }

  /**
   * Overall deliverables snapshot: per-program totals (left) + vulnerability rollups across programs (right).
   * Query: optional `from`, `to` (YYYY-MM-DD) on each report’s date column (inclusive when both set).
   */
  @Get('dashboard-report/deliverables-overall')
  @RequiredPermissions([
    'program.application_reports.list_view',
    'super_admin',
    'programs_manager',
    'read_only_super_admin',
  ])
  async getDeliverablesOverall(@Query() query: DeliverablesOverviewQueryDto) {
    const data = await this.newDashboardService.getDeliverablesOverallCard(query);
    return {
      success: true,
      message: 'Deliverables overall retrieved successfully',
      data,
    };
  }
}
