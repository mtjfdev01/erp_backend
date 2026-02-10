import {
  Controller,
  Get,
  Post,
  Query,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  DashboardMonthlyAgg,
  DashboardEventAgg,
} from './entities';
import { DashboardAggregateService } from './dashboard-aggregate.service';
import { DashboardRebuildService } from './dashboard-rebuild.service';
import { ConditionalJwtGuard } from '../auth/guards/conditional-jwt.guard';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { RequiredPermissions } from '../permissions';
import {
  DashboardSummaryQueryDto,
  DashboardMonthlyQueryDto,
  DashboardEventsQueryDto,
  DashboardFundraisingOverviewQueryDto,
} from './dto/dashboard-query.dto';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonthLabel(date: Date): string {
  return MONTH_NAMES[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
}

@Controller('dashboard')
@UseGuards(ConditionalJwtGuard, PermissionsGuard)
@RequiredPermissions(['dms.dashboard.view', 'super_admin'])
export class DashboardController {
  constructor(
    @InjectRepository(DashboardMonthlyAgg)
    private readonly monthlyAggRepo: Repository<DashboardMonthlyAgg>,
    @InjectRepository(DashboardEventAgg)
    private readonly eventAggRepo: Repository<DashboardEventAgg>,
    private readonly aggregateService: DashboardAggregateService,
    private readonly rebuildService: DashboardRebuildService,
  ) {}

  /**
   * GET /dashboard/summary?months=6
   * Returns latest month totals + last N months rows.
   */
  @Get('summary')
  async getSummary(
    @Query() query: DashboardSummaryQueryDto,
    @Res() res: Response,
  ) {
    try {
      const months = query.months ?? 6;
      const cutoff = new Date();
      cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
      cutoff.setUTCDate(1);
      cutoff.setUTCHours(0, 0, 0, 0);

      const rows = await this.monthlyAggRepo.find({
        where: { month_start_date: MoreThanOrEqual(cutoff) },
        order: { month_start_date: 'ASC' },
      });

      const latest = rows.length > 0 ? rows[rows.length - 1] : null;

      const summary = {
        latest_month: latest
          ? formatMonthLabel(new Date(latest.month_start_date))
          : null,
        totals: latest
          ? {
              total_raised: Number(latest.total_raised),
              total_individual_raised: Number(latest.total_individual_raised),
              total_csr_raised: Number(latest.total_csr_raised),
              total_events_raised: Number(latest.total_events_raised),
              total_online_raised: Number(latest.total_online_raised),
              total_phone_raised: Number(latest.total_phone_raised),
              total_corporate_raised: Number(latest.total_corporate_raised),
              total_event_channel_raised: Number(
                latest.total_event_channel_raised,
              ),
              total_donations_count: Number(latest.total_donations_count),
              total_donors_count: Number(latest.total_donors_count),
            }
          : null,
        months: rows.map((r) => ({
          month: formatMonthLabel(new Date(r.month_start_date)),
          month_start_date: r.month_start_date,
          online: Number(r.total_online_raised),
          phone: Number(r.total_phone_raised),
          events: Number(r.total_event_channel_raised),
          corporate: Number(r.total_corporate_raised),
          total: Number(r.total_raised),
        })),
      };

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Dashboard summary retrieved',
        data: summary,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  /**
   * GET /dashboard/monthly?months=12
   * Returns rows from dashboard_monthly_agg ordered by month_start_date asc.
   */
  @Get('monthly')
  async getMonthly(
    @Query() query: DashboardMonthlyQueryDto,
    @Res() res: Response,
  ) {
    try {
      const months = query.months ?? 12;
      const cutoff = new Date();
      cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
      cutoff.setUTCDate(1);
      cutoff.setUTCHours(0, 0, 0, 0);

      const rows = await this.monthlyAggRepo.find({
        where: { month_start_date: MoreThanOrEqual(cutoff) },
        order: { month_start_date: 'ASC' },
      });

      const data = rows.map((r) => ({
        month: formatMonthLabel(new Date(r.month_start_date)),
        month_start_date: r.month_start_date,
        online: Number(r.total_online_raised),
        phone: Number(r.total_phone_raised),
        events: Number(r.total_event_channel_raised),
        corporate: Number(r.total_corporate_raised),
        total: Number(r.total_raised),
        total_donations_count: Number(r.total_donations_count),
        total_donors_count: Number(r.total_donors_count),
      }));

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Monthly aggregates retrieved',
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  /**
   * GET /dashboard/fundraising-overview?months=12 | ?year=2024
   * Returns cards (totals by category), cumulative series, and raised-per-month for charts.
   */
  @Get('fundraising-overview')
  async getFundraisingOverview(
    @Query() query: DashboardFundraisingOverviewQueryDto,
    @Res() res: Response,
  ) {
    try {
      const data = await this.aggregateService.getFundraisingOverview({
        year: query.year,
        months: query.months,
      });
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Fundraising overview retrieved',
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
  }

  /**
   * GET /dashboard/events?month=2025-06-01
   * Returns events for that month using dashboard_event_agg joined with events meta.
   */
  @Get('events')
  async getEvents(
    @Query() query: DashboardEventsQueryDto,
    @Res() res: Response,
  ) {
    try {
      let monthStart: Date;
      if (query.month) {
        monthStart = new Date(query.month);
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
      } else {
        const now = new Date();
        monthStart = this.aggregateService.getMonthStart(now);
      }

      const rows = await this.eventAggRepo.find({
        where: { month_start_date: monthStart },
        relations: ['event'],
        order: { total_event_collection: 'DESC' },
      });

      const data = rows.map((r) => ({
        event_id: r.event_id,
        event_title: r.event?.title ?? null,
        event_slug: r.event?.slug ?? null,
        event_start_at: r.event?.start_at ?? null,
        month_start_date: r.month_start_date,
        total_event_collection: Number(r.total_event_collection),
        total_donations_count: Number(r.total_donations_count),
        total_donors_count: Number(r.total_donors_count),
      }));

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Event aggregates retrieved',
        data,
      });
    } catch (error: any) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: error.message,
        data: [],
      });
    }
  }

  /**
   * POST /dashboard/rebuild-aggregates
   * One-time full rebuild: empties all aggregation tables, then recalculates from
   * donations (with donor), donation_box_donations (verified/deposited).
   * Call this once to backfill or reset dashboard aggregates.
   */
  @Post('rebuild-aggregates')
  async rebuildAggregates(@Res() res: Response) {
    try {
      await this.rebuildService.fullRebuild();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Dashboard aggregates rebuilt successfully',
        data: null,
      });
    } catch (error: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message ?? 'Rebuild failed',
        data: null,
      });
    }
  }
}
