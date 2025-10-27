import { Injectable } from '@nestjs/common';
import { CreateSummaryDto } from './dto/create-summary.dto';
import { UpdateSummaryDto } from './dto/update-summary.dto';
import { reprots_tables } from '../../utils/db/tables';
import { EntityManager } from 'typeorm';

@Injectable()
export class SummaryService {
  constructor(private readonly entityManager: EntityManager) {}
  create(createSummaryDto: CreateSummaryDto) {
    return 'This action adds a new summary';
  }

  async findAll(saal: any) {
    try {
      let year = Number(saal);
      // console.log("summaryData called ______________________", typeof year);
      // return;
      const summaryData: any = {};
      
      // Separate aggregation queries per table with CASE statements
      // const tableAggregations = {
      //   education_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN male_orphans IS NOT NULL THEN male_orphans ELSE 0 END) as total_male_orphans,
      //       SUM(CASE WHEN female_orphans IS NOT NULL THEN female_orphans ELSE 0 END) as total_female_orphans,
      //       SUM(CASE WHEN male_divorced IS NOT NULL THEN male_divorced ELSE 0 END) as total_male_divorced,
      //       SUM(CASE WHEN female_divorced IS NOT NULL THEN female_divorced ELSE 0 END) as total_female_divorced,
      //       SUM(CASE WHEN male_disable IS NOT NULL THEN male_disable ELSE 0 END) as total_male_disable,
      //       SUM(CASE WHEN female_disable IS NOT NULL THEN female_disable ELSE 0 END) as total_female_disable,
      //       SUM(CASE WHEN male_indegent IS NOT NULL THEN male_indegent ELSE 0 END) as total_male_indegent,
      //       SUM(CASE WHEN female_indegent IS NOT NULL THEN female_indegent ELSE 0 END) as total_female_indegent
      //     FROM education_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
        
      //   financial_assistance_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN widow IS NOT NULL THEN widow ELSE 0 END) as total_widows,
      //       SUM(CASE WHEN divorced IS NOT NULL THEN divorced ELSE 0 END) as total_divorced,
      //       SUM(CASE WHEN disable IS NOT NULL THEN disable ELSE 0 END) as total_disable,
      //       SUM(CASE WHEN extreme_poor IS NOT NULL THEN extreme_poor ELSE 0 END) as total_indegent
      //     FROM financial_assistance_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
        
      //   // kasb_reports: `
      //   //   SELECT 
      //   //
      //   //     COUNT(*) as total_records,
      //   //     SUM(CASE WHEN loan_amount IS NOT NULL THEN loan_amount ELSE 0 END) as total_loans,
      //   //     SUM(CASE WHEN participants IS NOT NULL THEN participants ELSE 0 END) as total_participants,
      //   //     SUM(CASE WHEN training_hours IS NOT NULL THEN training_hours ELSE 0 END) as total_hours
      //   //   FROM kasb_reports 
      //   //   WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   // `,
        
      //   kasb_training_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN addition IS NOT NULL THEN addition ELSE 0 END) as total_addition
      //     FROM kasb_training_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
        
      //   marriage_gift_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN orphans IS NOT NULL THEN orphans ELSE 0 END) as total_orphans,
      //       SUM(CASE WHEN divorced IS NOT NULL THEN divorced ELSE 0 END) as total_divorced,
      //       SUM(CASE WHEN disable IS NOT NULL THEN gift_disable ELSE 0 END) as total_diable,
      //       SUM(CASE WHEN indegent IS NOT NULL THEN indegent ELSE 0 END) as total_indegent
      //     FROM marriage_gift_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
        
      //   sewing_machine_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN orphans IS NOT NULL THEN orphans ELSE 0 END) as total_orphans,
      //       SUM(CASE WHEN divorced IS NOT NULL THEN divorced ELSE 0 END) as total_divorced,
      //       SUM(CASE WHEN disable IS NOT NULL THEN disable ELSE 0 END) as total_disable,
      //       SUM(CASE WHEN indegent IS NOT NULL THEN indegent ELSE 0 END) as total_indegent
      //     FROM sewing_machine_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
      //   ration_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN full_widows IS NOT NULL THEN full_widows ELSE 0 END) as total_full_widows,
      //       SUM(CASE WHEN full_divorced IS NOT NULL THEN full_divorced ELSE 0 END) as total_full_divorced,
      //       SUM(CASE WHEN full_disable IS NOT NULL THEN full_disable ELSE 0 END) as total_full_disable,
      //       SUM(CASE WHEN full_indegent IS NOT NULL THEN full_indegent ELSE 0 END) as total_full_indegent,
      //       SUM(CASE WHEN full_orphan IS NOT NULL THEN full_orphan ELSE 0 END) as total_full_orphan,
      //       SUM(CASE WHEN half_widows IS NOT NULL THEN half_widows ELSE 0 END) as total_half_widows,
      //       SUM(CASE WHEN half_divorced IS NOT NULL THEN half_divorced ELSE 0 END) as total_half_divorced,
      //       SUM(CASE WHEN half_disable IS NOT NULL THEN half_disable ELSE 0 END) as total_half_disable,
      //       SUM(CASE WHEN half_indegent IS NOT NULL THEN half_indegent ELSE 0 END) as total_half_indegent,
      //       SUM(CASE WHEN half_orphan IS NOT NULL THEN half_orphan ELSE 0 END) as total_half_orphan,
      //       SUM(CASE WHEN full_divorced IS NOT NULL THEN full_divorced ELSE 0 END) as total_full_divorced
      //     FROM ration_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
        
      //   tree_plantation_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN plants IS NOT NULL THEN plants ELSE 0 END) as total_plants
      //     FROM tree_plantation_reports 
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false
      //   `,
        
      //   water_reports: `
      //     SELECT 
      //       COUNT(*) as total_records,
      //       SUM(CASE WHEN system = 'Hand Pump Indoor' THEN quantity ELSE 0 END) as total_hand_pump_indoor,
      //       SUM(CASE WHEN system = 'Hand Pump Outdoor' THEN quantity ELSE 0 END) as total_hand_pump_outdoor,
      //       SUM(CASE WHEN system = 'Water Motor Indoor' THEN quantity ELSE 0 END) as total_water_motor_indoor,
      //       SUM(CASE WHEN system = 'Water Motor Outdoor' THEN quantity ELSE 0 END) as total_water_motor_outdoor,
      //       SUM(CASE WHEN system = 'Affrideve HP' THEN quantity ELSE 0 END) as total_affrideve_hp,
      //       SUM(CASE WHEN system = 'WF PLANT' THEN quantity ELSE 0 END) as total_wf_plant   
      //     FROM water_reports  
      //     WHERE (YEAR(date) = ? OR YEAR(report_date) = ?) AND is_archived = false AND activity = Installation
      //   `,
        
      //   wheel_chair_or_crutches_reports: ` 
      //     SELECT 
      //         -- Wheel Chair breakdown
      //         SUM(CASE WHEN type = 'Wheel Chair' THEN orphans ELSE 0 END) AS wheel_chair_orphans,
      //         SUM(CASE WHEN type = 'Wheel Chair' THEN divorced ELSE 0 END) AS wheel_chair_divorced,
      //         SUM(CASE WHEN type = 'Wheel Chair' THEN disable ELSE 0 END) AS wheel_chair_disable,
      //         SUM(CASE WHEN type = 'Wheel Chair' THEN indegent ELSE 0 END) AS wheel_chair_indegent,

      //         -- Crutches breakdown
      //         SUM(CASE WHEN type = 'Crutches' THEN orphans ELSE 0 END) AS crutches_orphans,
      //         SUM(CASE WHEN type = 'Crutches' THEN divorced ELSE 0 END) AS crutches_divorced,
      //         SUM(CASE WHEN type = 'Crutches' THEN disable ELSE 0 END) AS crutches_disable,
      //         SUM(CASE WHEN type = 'Crutches' THEN indegent ELSE 0 END) AS crutches_indegent,

      //         -- Total per vulnerability (all types)
      //         SUM(orphans) AS total_orphans,
      //         SUM(divorced) AS total_divorced,
      //         SUM(disable) AS total_disable,
      //         SUM(indegent) AS total_indegent,

      //         -- Totals by gender
      //         SUM(CASE WHEN gender = 'Male' THEN orphans + divorced + disable + indegent ELSE 0 END) AS total_male,
      //         SUM(CASE WHEN gender = 'Female' THEN orphans + divorced + disable + indegent ELSE 0 END) AS total_female,

      //         -- ✅ Total Wheel Chairs (sum all fields for Wheel Chair)
      //         SUM(CASE WHEN type = 'Wheel Chair' THEN orphans + divorced + disable + indegent ELSE 0 END) AS total_wheel_chairs,

      //         -- ✅ Total Crutches (sum all fields for Crutches)
      //         SUM(CASE WHEN type = 'Crutches' THEN orphans + divorced + disable + indegent ELSE 0 END) AS total_crutches,

      //         -- ✅ Grand total
      //         SUM(orphans + divorced + disable + indegent) AS total_all_items

      //       FROM wheel_chair_or_crutches_reports
      //       WHERE (YEAR(date) = ? OR YEAR(report_date) = ?)
      //         AND is_archived = false;
      //   `
      // };
      


      const tableAggregations = {
        education_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(male_orphans, 0))    AS total_male_orphans,
            SUM(COALESCE(female_orphans, 0))  AS total_female_orphans,
            SUM(COALESCE(male_divorced, 0))   AS total_male_divorced,
            SUM(COALESCE(female_divorced, 0)) AS total_female_divorced,
            SUM(COALESCE(male_disable, 0))    AS total_male_disable,
            SUM(COALESCE(female_disable, 0))  AS total_female_disable,
            SUM(COALESCE(male_indegent, 0))   AS total_male_indegent,
            SUM(COALESCE(female_indegent, 0)) AS total_female_indegent,
            SUM(COALESCE(male_orphans,0) + COALESCE(male_divorced,0) + COALESCE(male_disable,0) + COALESCE(male_indegent,0))   AS boys_achieved,
            SUM(COALESCE(female_orphans,0) + COALESCE(female_divorced,0) + COALESCE(female_disable,0) + COALESCE(female_indegent,0)) AS girls_achieved,
            SUM(COALESCE(male_orphans,0) + COALESCE(male_divorced,0) + COALESCE(male_disable,0) + COALESCE(male_indegent,0) + COALESCE(female_orphans,0) + COALESCE(female_divorced,0) + COALESCE(female_disable,0) + COALESCE(female_indegent,0)) AS total_achieved
          FROM education_reports 
          WHERE is_archived = false
            AND "date" >= make_date($1::int, 1, 1)
            AND "date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        financial_assistance_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(widow, 0))        AS total_widows,
            SUM(COALESCE(divorced, 0))     AS total_divorced,
            SUM(COALESCE(disable, 0))      AS total_disable,
            SUM(COALESCE(extreme_poor, 0)) AS total_indegent,
            SUM(COALESCE(widow, 0) + COALESCE(divorced, 0))       AS female_achieved,
            SUM(COALESCE(disable, 0) + COALESCE(extreme_poor, 0)) AS male_achieved
          FROM financial_assistance_reports 
          WHERE is_archived = false
              AND "report_date" >= make_date($1::int, 1, 1)
              AND "report_date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        kasb_training_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(addition, 0)) AS total_addition,
            0 AS male_achieved,
            SUM(COALESCE(addition, 0)) AS female_achieved,
            SUM(COALESCE(addition, 0)) AS total_achieved
          FROM kasb_training_reports 
          WHERE is_archived = false
           AND "date" >= make_date($1::int, 1, 1)
            AND "date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        marriage_gift_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(orphans, 0))  AS total_orphans,
            SUM(COALESCE(divorced, 0)) AS total_divorced,
            SUM(COALESCE(disable, 0))  AS total_disable,
            SUM(COALESCE(indegent, 0)) AS total_indegent,
            0 AS male_achieved,
            SUM(COALESCE(orphans, 0) + COALESCE(divorced, 0) + COALESCE(disable, 0) + COALESCE(indegent, 0)) AS female_achieved,
            SUM(COALESCE(orphans, 0) + COALESCE(divorced, 0) + COALESCE(disable, 0) + COALESCE(indegent, 0)) AS total_achieved
          FROM marriage_gift_reports 
          WHERE is_archived = false
           AND "report_date" >= make_date($1::int, 1, 1)
            AND "report_date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        sewing_machine_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(orphans, 0))  AS total_orphans,
            SUM(COALESCE(divorced, 0)) AS total_divorced,
            SUM(COALESCE(disable, 0))  AS total_disable,
            SUM(COALESCE(indegent, 0)) AS total_indegent,
            0 AS male_achieved,
            SUM(COALESCE(orphans, 0) + COALESCE(divorced, 0) + COALESCE(disable, 0) + COALESCE(indegent, 0)) AS female_achieved,
            SUM(COALESCE(orphans, 0) + COALESCE(divorced, 0) + COALESCE(disable, 0) + COALESCE(indegent, 0)) AS total_achieved
          FROM sewing_machine_reports 
          WHERE is_archived = false
          AND "date" >= make_date($1::int, 1, 1)
          AND "date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        ration_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(full_widows, 0))   AS total_full_widows,
            SUM(COALESCE(full_divorced, 0)) AS total_full_divorced,
            SUM(COALESCE(full_disable, 0))  AS total_full_disable,
            SUM(COALESCE(full_indegent, 0)) AS total_full_indegent,
            SUM(COALESCE(full_orphan, 0))   AS total_full_orphan,
            SUM(COALESCE(half_widows, 0))   AS total_half_widows,
            SUM(COALESCE(half_divorced, 0)) AS total_half_divorced,
            SUM(COALESCE(half_disable, 0))  AS total_half_disable,
            SUM(COALESCE(half_indegent, 0)) AS total_half_indegent,
            SUM(COALESCE(half_orphan, 0))   AS total_half_orphan,
            SUM(COALESCE(full_disable, 0) + COALESCE(full_indegent, 0) + COALESCE(full_orphan, 0) + COALESCE(half_disable, 0) + COALESCE(half_indegent, 0) + COALESCE(half_orphan, 0)) AS male_achieved,
            SUM(COALESCE(full_widows, 0) + COALESCE(full_divorced, 0) + COALESCE(half_widows, 0) + COALESCE(half_divorced, 0)) AS female_achieved,
            SUM(COALESCE(full_widows, 0) + COALESCE(full_divorced, 0) + COALESCE(half_widows, 0) + COALESCE(half_divorced, 0) + COALESCE(full_disable, 0) + COALESCE(full_indegent, 0) + COALESCE(full_orphan, 0) + COALESCE(half_disable, 0) + COALESCE(half_indegent, 0) + COALESCE(half_orphan, 0)) AS total_achieved
          FROM ration_reports 
          WHERE is_archived = false
           AND "report_date" >= make_date($1::int, 1, 1)
            AND "report_date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        tree_plantation_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(COALESCE(plants, 0)) AS total_plants,
            SUM(COALESCE(plants, 0)) AS total_achieved
          FROM tree_plantation_reports 
          WHERE is_archived = false
            AND "report_date" >= make_date($1::int, 1, 1)
            AND "report_date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        water_reports: `
          SELECT 
            COUNT(*) AS total_records,
            SUM(CASE WHEN system = 'Hand Pump Indoor'  THEN COALESCE(quantity,0) ELSE 0 END) AS total_hand_pump_indoor,
            SUM(CASE WHEN system = 'Hand Pump Outdoor' THEN COALESCE(quantity,0) ELSE 0 END) AS total_hand_pump_outdoor,
            SUM(CASE WHEN system = 'Water Motor Indoor' THEN COALESCE(quantity,0) ELSE 0 END) AS total_water_motor_indoor,
            SUM(CASE WHEN system = 'Water Motor Outdoor' THEN COALESCE(quantity,0) ELSE 0 END) AS total_water_motor_outdoor,
            SUM(CASE WHEN system = 'Affrideve HP'      THEN COALESCE(quantity,0) ELSE 0 END) AS total_affrideve_hp,
            SUM(CASE WHEN system = 'WF PLANT'          THEN COALESCE(quantity,0) ELSE 0 END) AS total_wf_plant,
            SUM(CASE WHEN system = 'Hand Pump Indoor'  THEN COALESCE(quantity,0) ELSE 0 END) + SUM(CASE WHEN system = 'Hand Pump Outdoor' THEN COALESCE(quantity,0) ELSE 0 END) + SUM(CASE WHEN system = 'Water Motor Indoor' THEN COALESCE(quantity,0) ELSE 0 END) + SUM(CASE WHEN system = 'Water Motor Outdoor' THEN COALESCE(quantity,0) ELSE 0 END) + SUM(CASE WHEN system = 'Affrideve HP'      THEN COALESCE(quantity,0) ELSE 0 END) + SUM(CASE WHEN system = 'WF PLANT'          THEN COALESCE(quantity,0) ELSE 0 END) AS total_achieved
          FROM water_reports  
          WHERE is_archived = false
            AND activity = 'Installation'
            AND "date" >= make_date($1::int, 1, 1)
            AND "date" <  make_date(($1::int + 1), 1, 1)
        `,
      
        wheel_chair_or_crutches_reports: `
          SELECT 
            -- Wheel Chair breakdown
            SUM(CASE WHEN type = 'Wheel Chair' THEN COALESCE(orphans,0)  ELSE 0 END) AS wheel_chair_orphans,
            SUM(CASE WHEN type = 'Wheel Chair' THEN COALESCE(divorced,0) ELSE 0 END) AS wheel_chair_divorced,
            SUM(CASE WHEN type = 'Wheel Chair' THEN COALESCE(disable,0)  ELSE 0 END) AS wheel_chair_disable,
            SUM(CASE WHEN type = 'Wheel Chair' THEN COALESCE(indegent,0) ELSE 0 END) AS wheel_chair_indegent,
      
            -- Crutches breakdown
            SUM(CASE WHEN type = 'Crutches' THEN COALESCE(orphans,0)  ELSE 0 END) AS crutches_orphans,
            SUM(CASE WHEN type = 'Crutches' THEN COALESCE(divorced,0) ELSE 0 END) AS crutches_divorced,
            SUM(CASE WHEN type = 'Crutches' THEN COALESCE(disable,0)  ELSE 0 END) AS crutches_disable,
            SUM(CASE WHEN type = 'Crutches' THEN COALESCE(indegent,0) ELSE 0 END) AS crutches_indegent,
      
            -- Total per vulnerability (all types)
            SUM(COALESCE(orphans,0))  AS total_orphans,
            SUM(COALESCE(divorced,0)) AS total_divorced,
            SUM(COALESCE(disable,0))  AS total_disable,
            SUM(COALESCE(indegent,0)) AS total_indegent,
      
            -- Totals by gender
            SUM(CASE WHEN gender = 'Male'   THEN COALESCE(orphans,0)+COALESCE(divorced,0)+COALESCE(disable,0)+COALESCE(indegent,0) ELSE 0 END) AS male_achieved,
            SUM(CASE WHEN gender = 'Female' THEN COALESCE(orphans,0)+COALESCE(divorced,0)+COALESCE(disable,0)+COALESCE(indegent,0) ELSE 0 END) AS female_achieved,
      
            -- Totals by type
            SUM(CASE WHEN type = 'Wheel Chair' THEN COALESCE(orphans,0)+COALESCE(divorced,0)+COALESCE(disable,0)+COALESCE(indegent,0) ELSE 0 END) AS total_wheel_chairs,
            SUM(CASE WHEN type = 'Crutches'    THEN COALESCE(orphans,0)+COALESCE(divorced,0)+COALESCE(disable,0)+COALESCE(indegent,0) ELSE 0 END) AS total_crutches,
      
            -- Grand total
            SUM(COALESCE(orphans,0)+COALESCE(divorced,0)+COALESCE(disable,0)+COALESCE(indegent,0)) AS total_achieved,
      
            COUNT(*) AS total_records
          FROM wheel_chair_or_crutches_reports
          WHERE is_archived = false
            AND "date" >= make_date($1::int, 1, 1)
            AND "date" <  make_date(($1::int + 1), 1, 1)
        `
      };
      

      // Execute aggregation queries for each table
      for (const [tableKey, query] of Object.entries(tableAggregations)) {
        try {
          const result = await this.entityManager.query(query, [year]);
          summaryData[tableKey] = result[0]; // Get first row of aggregation
        } catch (tableError) {
          console.error(`Error querying table ${tableKey}:`, tableError);
          summaryData[tableKey] = { 
            error: 'Query failed',
            total_records: 0,
            total_amount: 0,
            total_quantity: 0,
            total_beneficiaries: 0
          };
        }
      }

      const n = (v) => (v == null ? 0 : Number(v) || 0); // handles null/undefined/"12"
      // now format data according vulnerability type
      //add widows achieved in summary data
      const total_widows_achieved = n(summaryData.financial_assistance_reports.total_widows) + n(summaryData.ration_reports.total_full_widows) + n(summaryData.ration_reports.total_half_widows);
      // DIVORCED achieved 
      const total_divorced_achieved = n(summaryData.financial_assistance_reports.total_divorced) + n(summaryData.ration_reports.total_full_divorced) + n(summaryData.ration_reports.total_half_divorced);
      // DISABLED achieved
      const total_disabled_achieved = n(summaryData.financial_assistance_reports.total_disable) + n(summaryData.ration_reports.total_full_disable) + n(summaryData.ration_reports.total_half_disable);
      // INDEGENT achieved
      const total_indegent_achieved = n(summaryData.financial_assistance_reports.total_indegent) + n(summaryData.ration_reports.total_full_indegent) + n(summaryData.ration_reports.total_half_indegent);
      // ORPHANS achieved
      const total_orphans_achieved = n(summaryData.education_reports.total_orphans) + n(summaryData.marriage_gift_reports.total_orphans) + n(summaryData.sewing_machine_reports.total_orphans) + n(summaryData.wheel_chair_or_crutches_reports.total_orphans);
      //add women-headed households achieved in summary data
      const total_women_headed_households_achieved = n(summaryData.financial_assistance_reports.total_women_headed_households);
      // total targeted





      // total girls achieved 
      // null is added with number 0    
      const total_girls_achieved = n(summaryData.education_reports.girls_achieved);
      

      // total boys achieved
      // null is added with number 0
      const total_boys_achieved = n(summaryData.education_reports.boys_achieved);
      // total achieved
      const total_young_achieved = total_girls_achieved + total_boys_achieved;

      // total female achieved
      const total_female_achieved = n(summaryData.financial_assistance_reports.female_achieved) + n(summaryData.kasb_training_reports.female_achieved) + n(summaryData.marriage_gift_reports.female_achieved) + n(summaryData.sewing_machine_reports.female_achieved) + n(summaryData.ration_reports.female_achieved) + n(summaryData.wheel_chair_or_crutches_reports.female_achieved);

      // total male achieved
      const total_male_achieved = n(summaryData.financial_assistance_reports.male_achieved) + n(summaryData.ration_reports.male_achieved) + n(summaryData.wheel_chair_or_crutches_reports.male_achieved);
      
      // total achieved
      const total_adult_achieved =  total_female_achieved + total_male_achieved;
      
      
      // I  think we should add all achieded in a summaryData key achievements  

      summaryData.achievements = {
        // category wise also includes gender wise and  vulnerabiulity wise 
        category_wise: {
        total_girls_achieved: total_girls_achieved,
        total_boys_achieved: total_boys_achieved,
        total_young_achieved: total_young_achieved, 
        total_widows_achieved: total_widows_achieved,
        total_divorced_achieved: total_divorced_achieved,
        total_disabled_achieved: total_disabled_achieved,
        total_indegent_achieved: total_indegent_achieved,
        total_orphans_achieved: total_orphans_achieved,
        total_women_headed_households_achieved: total_women_headed_households_achieved,
        total_female_achieved: total_female_achieved,
        total_male_achieved: total_male_achieved,
        total_adult_achieved: total_adult_achieved,
      },
      // use program keys here as keys here 
      program_wise: {
          total_achieved: summaryData.education_reports.total_achieved + summaryData.financial_assistance_reports.total_achieved + summaryData.kasb_training_reports.total_achieved + summaryData.marriage_gift_reports.total_achieved + summaryData.sewing_machine_reports.total_achieved + summaryData.ration_reports.total_achieved,
          education_reports: summaryData.education_reports,
          financial_assistance_reports: summaryData.financial_assistance_reports,
          kasb_training_reports: summaryData.kasb_training_reports,
          marriage_gift_reports: summaryData.marriage_gift_reports,
          sewing_machine_reports: summaryData.sewing_machine_reports,
          ration_reports: summaryData.ration_reports,
        },
        
      }
      
      summaryData.targets = {
        category_wise: {
          girls_target: summaryData.achievements.category_wise.total_girls_achieved * 0.15,
          boys_target: summaryData.achievements.category_wise.total_boys_achieved * 0.15,
          total_target: summaryData.achievements.category_wise.total_young_achieved * 0.15,
          widows_target: summaryData.achievements.category_wise.total_widows_achieved * 0.15,
          divorced_target: summaryData.achievements.category_wise.total_divorced_achieved * 0.15,
          disabled_target: summaryData.achievements.category_wise.total_disabled_achieved * 0.15,
          indegent_target: summaryData.achievements.category_wise.total_indegent_achieved * 0.15,
          youth_target: summaryData.achievements.category_wise.total_young_achieved * 0.15,
          female_target: summaryData.achievements.category_wise.total_female_achieved * 0.15,
          male_target: summaryData.achievements.category_wise.total_male_achieved * 0.15,
          adult_target: summaryData.achievements.category_wise.total_adult_achieved * 0.15,
          orphans_target: summaryData.achievements.category_wise.total_orphans_achieved * 0.15,
          women_headed_households_target: summaryData.achievements.category_wise.total_women_headed_households_achieved * 0.15,
          young_target: summaryData.achievements.category_wise.total_young_achieved * 0.15,
        },
        program_wise: {

        }
      }


        // get the program targets
        // update this to fetch targets in format like
        // target formats i need 
        // male  => where vulnerability is , disable, indegent, orphans, male
        // female => where vulnerability is widow, divorced, female
        // total => where vulnerability is sum of all above
      // const programTargets = await this.entityManager.query(
      //   `SELECT * FROM program_targets WHERE year = $1`,
      //   [year]
      // );
      // console.log("programTargets", programTargets);

      // now we will set dummy tartgets is such a way that it should be 15, to 20% dynamically for  each program plus 
      //each category


      return {
        success: true,
        data: summaryData,
        year: year,
        total_tables: Object.keys(tableAggregations).length
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} summary`;
  }

  update(id: number, updateSummaryDto: UpdateSummaryDto) {
    return `This action updates a #${id} summary`;
  }

  remove(id: number) {
    return `This action removes a #${id} summary`;
  }
}
