import { ComplaintStatus } from "../entities/complaint.entity";

export class ComplaintApprovalMetaEntryDto {
  user_id: number;
  decision: "approved" | "rejected" | "pending";
  decided_at?: Date;
}

export class ComplaintApprovalStateDto {
  complaint_id: number;
  complaint?: any;
  approval_required_user_ids: number[] | null;
  approvals_meta: ComplaintApprovalMetaEntryDto[] | null;
  approved_by_id: number[] | null;
  rejected_by_id: number[] | null;
  approval_status: ComplaintStatus | null;
  approved_note?:
    | {
        user_id: number;
        note: string;
        decided_at?: Date;
      }[]
    | null;
  rejected_note?:
    | {
        user_id: number;
        note: string;
        decided_at?: Date;
      }[]
    | null;
  submission_note?:
    | {
        user_id: number;
        note: string;
        created_at?: Date;
      }[]
    | null;
}
