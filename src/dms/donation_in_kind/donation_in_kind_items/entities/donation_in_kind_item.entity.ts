import { Entity, Column } from "typeorm";
import { BaseEntity } from "../../../../utils/base_utils/entities/baseEntity";

export enum ItemCategory {
  CLOTHING = "clothing",
  FOOD = "food",
  MEDICAL = "medical",
  EDUCATIONAL = "educational",
  ELECTRONICS = "electronics",
  FURNITURE = "furniture",
  BOOKS = "books",
  TOYS = "toys",
  HOUSEHOLD = "household",
  FOOD_ITEMS = "food_items",
  BEVERAGES_REFRESHMENTS = "beverages_refreshments",
  CLOTHING_APPAREL = "clothing_apparel",
  HYGIENE_PERSONAL_CARE = "hygiene_personal_care",
  MEDICAL_SUPPLIES = "medical_supplies",
  EDUCATION_STATIONERY = "education_stationery",
  HOUSEHOLD_ITEMS = "household_items",
  RELIEF_EMERGENCY = "relief_emergency",
  IT_ELECTRONICS = "it_electronics",
  CONSTRUCTION_MATERIALS = "construction_materials",
  AGRICULTURE_PLANTATION = "agriculture_plantation",
  OFFICE_SUPPLIES = "office_supplies",
  OTHER = "other",
}

@Entity("donation_in_kind_item")
export class DonationInKindItem extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  // Category (Required - as requested)
  @Column({ type: "text", nullable: true })
  category: string;
}
