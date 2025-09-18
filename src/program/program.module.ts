import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationReportsModule } from './application_reports/application-reports.module';
import { RationModule } from './ration/ration.module';
import { MarriageGiftsModule } from './marriage_gifts/marriage-gifts.module';
import { FinancialAssistanceModule } from './financial_assistance/financial-assistance.module';
import { SewingMachineModule } from './sewing_machine/reports/sewing-machine-reports.module';
import { WheelChairOrCrutchesModule } from './wheel_chair_or_crutches/reports/wheel-chair-or-crutches-reports.module';
import { WaterReportsModule } from './water/reports/water-reports.module';
import { KasbReportsModule } from './kasb/reports/kasb-reports.module';
import { KasbTrainingReportsModule } from './kasb_training/reports/kasb-training-reports.module';
import { EducationReportsModule } from './education/reports/education-reports.module';
import { TreePlantationReportsModule } from './tree_plantation/reports/tree-plantation-reports.module';
import { AreaRationReportsModule } from './area_ration/reports/area-ration-reports.module';
import { FinancialAssistanceReportsModule } from './financial_assistance/reports/financial-assistance-reports.module';
import { TargetsModule } from './targets/targets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    ApplicationReportsModule,
    RationModule,
    MarriageGiftsModule,
    FinancialAssistanceModule,
    SewingMachineModule,
    WheelChairOrCrutchesModule,
    WaterReportsModule,
    KasbReportsModule,
    KasbTrainingReportsModule,
    EducationReportsModule,
    TreePlantationReportsModule,
    AreaRationReportsModule,
    FinancialAssistanceReportsModule,
    TargetsModule,
  ],
  controllers: [],
  providers: [],
  exports: [ApplicationReportsModule, RationModule, MarriageGiftsModule, FinancialAssistanceModule, SewingMachineModule, WheelChairOrCrutchesModule, WaterReportsModule, KasbReportsModule, KasbTrainingReportsModule, EducationReportsModule, TreePlantationReportsModule, AreaRationReportsModule],
})
export class ProgramModule {} 