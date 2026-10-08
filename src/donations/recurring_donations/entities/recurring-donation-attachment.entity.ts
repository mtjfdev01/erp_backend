import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "src/utils/base_utils/entities/baseEntity";
import { RecurringDonation } from "./recurring-donation.entity";
import { User } from "src/users/user.entity";

@Entity("recurring_donation_attachments")
export class RecurringDonationAttachment extends BaseEntity {
  @ManyToOne(() => RecurringDonation, (row) => row.attachments, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "recurring_donation_id" })
  recurring_donation: RecurringDonation;

  @Column({ type: "varchar" })
  file_name: string;

  @Column({ type: "varchar" })
  file_url: string;

  @Column({ type: "varchar", nullable: true })
  file_type: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @ManyToOne(() => User, (user) => user.id, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "uploaded_by" })
  uploaded_by: User;
}
