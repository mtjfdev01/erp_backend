export const formatUserName = (user: any): string => {
  if (!user || typeof user !== "object") return "";
  const named = String(user.name || "").trim();
  if (named) return named;
  const fromParts = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  if (fromParts) return fromParts;
  const email = String(user.email || "").trim();
  return email;
};

export const formatDate = (dateValue: any): string => {
  if (!dateValue) return "N/A";
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "N/A";
  }
};

export const generateTaskApprovalTemplate = (
  approver: any,
  task: any,
  submitter?: any,
): string => {
  const submitterName =
    formatUserName(submitter) ||
    submitter?.email ||
    "An assignee";

  const approverName =
    formatUserName(approver) ||
    approver?.email ||
    "Approver";

  const taskDueDate = formatDate(task?.due_date);
  const approvalDueDate = formatDate(task?.approval_due_date);
  const taskId = task?.id || "";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Task Submitted for Your Approval</h2>
      <p>Dear ${approverName},</p>
      <p>The following task has been submitted for your formal review and approval:</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 18px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 4px 0;"><strong>Task Title:</strong> ${task?.title || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Department:</strong> ${task?.department || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Priority:</strong> ${task?.priority || "Medium"}</p>
        <p style="margin: 4px 0;"><strong>Submitted By:</strong> ${submitterName}</p>
        <p style="margin: 4px 0;"><strong>Task Due Date:</strong> ${taskDueDate}</p>
        <p style="margin: 4px 0; color: #dc2626;"><strong>Approval Due Date:</strong> ${approvalDueDate}</p>
        ${task?.description ? `<p style="margin: 8px 0 4px 0;"><strong>Description:</strong> ${task.description}</p>` : ""}
      </div>

      <p>Please review the submitted deliverables and approve or request revisions by the Approval Due Date.</p>
      
      <p style="margin-top: 24px;">
        <a href="https://erp.mtjfoundation.pk/tasks/view/${taskId}" style="background-color: #2563eb; color: #ffffff; padding: 10px 22px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Review Task Deliverables
        </a>
      </p>
      
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        This is an automated notification from MTJ Foundation ERP.
      </p>
    </div>
  `;
};

export { generateTaskApprovalTemplate as taskApprovalTemplate };
export { generateTaskApprovalTemplate as generateTaskApprovalEmailTemplate };
export default generateTaskApprovalTemplate;
