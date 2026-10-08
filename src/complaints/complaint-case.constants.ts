import { ComplaintWorkflowStatus } from "./entities/complaint.entity";

export const COMPLAINT_WORKFLOW_STATUS_OPTIONS: {
  value: ComplaintWorkflowStatus;
  label: string;
}[] = [
  { value: ComplaintWorkflowStatus.ACKNOWLEDGED, label: "Acknowledged" },
  { value: ComplaintWorkflowStatus.UNDER_REVIEW, label: "Under Review" },
  { value: ComplaintWorkflowStatus.INVESTIGATING, label: "Investigating" },
  { value: ComplaintWorkflowStatus.PENDING_INFORMATION, label: "Pending Information" },
  { value: ComplaintWorkflowStatus.ESCALATED, label: "Escalated" },
  { value: ComplaintWorkflowStatus.RESOLVED, label: "Resolved" },
  { value: ComplaintWorkflowStatus.CLOSED_REJECTED, label: "Closed / Rejected" },
];

/** Map legacy DB values to the current workflow (for display / migration). */
export const LEGACY_COMPLAINT_WORKFLOW_STATUS_MAP: Record<string, ComplaintWorkflowStatus> = {
  submitted: ComplaintWorkflowStatus.ACKNOWLEDGED,
  under_investigation: ComplaintWorkflowStatus.INVESTIGATING,
  dismissed: ComplaintWorkflowStatus.CLOSED_REJECTED,
  closed: ComplaintWorkflowStatus.CLOSED_REJECTED,
};
