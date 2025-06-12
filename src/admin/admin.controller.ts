import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminReportDto } from './dto/admin-report.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@Controller('api/admin')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('report')
  async getDailyReport(@Body() reportDto: AdminReportDto) {
    return this.adminService.generateDailyReport(reportDto.fromDate, reportDto.toDate);
  }
}
