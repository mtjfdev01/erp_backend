import { formatUserName, formatDate } from "./taskApprovalTemplate";

export const generateExtensionRequestEmailTemplate = (
  task: any,
  extension: any,
  requester: any,
  managerOrCreator: any,
): string => {
  const recipientName =
    formatUserName(managerOrCreator) ||
    managerOrCreator?.email ||
    "Manager / Creator";

  const requesterName =
    formatUserName(requester) ||
    requester?.email ||
    "An assignee";

  const currentDueDate = formatDate(extension?.current_due_date || task?.due_date);
  const proposedDueDate = formatDate(extension?.proposed_due_date);
  const originalDueDate = formatDate(task?.original_due_date || task?.due_date);
  const taskId = task?.id || "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Task Deadline Extension Requested</h2>
      <p>Dear ${recipientName},</p>
      <p>An extension request has been submitted for the following task and requires your review:</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px 18px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 4px 0;"><strong>Task Title:</strong> ${task?.title || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Department:</strong> ${task?.department || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Requested By:</strong> ${requesterName}</p>
        <p style="margin: 4px 0;"><strong>Original Due Date:</strong> ${originalDueDate}</p>
        <p style="margin: 4px 0;"><strong>Current Due Date:</strong> ${currentDueDate}</p>
        <p style="margin: 4px 0; color: #d97706; font-size: 15px;"><strong>Proposed New Due Date:</strong> ${proposedDueDate}</p>
        <p style="margin: 8px 0 4px 0; background-color: #ffffff; padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0;">
          <strong>Reason for Extension:</strong><br/>
          ${extension?.reason || "No reason specified."}
        </p>
      </div>

      <p>Please review and approve or reject this deadline extension request in the task view.</p>
      
      <p style="margin-top: 24px;">
        <a href="https://erp.mtjfoundation.pk/tasks/view/${taskId}" style="background-color: #f59e0b; color: #ffffff; padding: 10px 22px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Review Extension Request
        </a>
      </p>
      
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        This is an automated notification from MTJ Foundation ERP.
      </p>
    </div>
  `;
};

export const generateExtensionDecisionEmailTemplate = (
  task: any,
  extension: any,
  decision: "approved" | "rejected",
  reviewer: any,
): string => {
  const reviewerName =
    formatUserName(reviewer) ||
    reviewer?.email ||
    "Task Manager / Creator";

  const isApproved = decision === "approved";
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  const statusBorder = isApproved ? "#22c55e" : "#ef4444";
  const statusText = isApproved ? "Approved" : "Rejected";
  const originalDueDate = formatDate(task?.original_due_date || task?.due_date);
  const newDueDate = formatDate(task?.due_date || extension?.proposed_due_date);
  const taskId = task?.id || "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Deadline Extension Request ${statusText}</h2>
      <p>Hello,</p>
      <p>Your deadline extension request has been <strong style="color: ${statusColor}; text-transform: uppercase;">${statusText}</strong> by ${reviewerName}.</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid ${statusBorder}; padding: 14px 18px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 4px 0;"><strong>Task Title:</strong> ${task?.title || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Original Due Date:</strong> ${originalDueDate}</p>
        ${
          isApproved
            ? `<p style="margin: 4px 0; color: #16a34a; font-size: 15px;"><strong>New Approved Due Date:</strong> ${newDueDate}</p>`
            : `<p style="margin: 4px 0; color: #dc2626;"><strong>Effective Due Date:</strong> ${formatDate(task?.due_date)}</p>`
        }
        ${
          extension?.review_note
            ? `<p style="margin: 8px 0 4px 0; background-color: #ffffff; padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0;">
                <strong>Reviewer Note:</strong><br/>
                ${extension.review_note}
              </p>`
            : ""
        }
      </div>

      <p style="margin-top: 24px;">
        <a href="https://erp.mtjfoundation.pk/tasks/view/${taskId}" style="background-color: #2563eb; color: #ffffff; padding: 10px 22px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          View Task
        </a>
      </p>
      
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        This is an automated notification from MTJ Foundation ERP.
      </p>
    </div>
  `;
};
