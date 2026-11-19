const formatUserName = (user: any): string | null => {
  if (!user || typeof user !== "object") return null;
  const named = String(user.name || "").trim();
  if (named) return named;
  const fromParts = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  if (fromParts) return fromParts;
  const email = String(user.email || "").trim();
  return email || null;
};

const formatAssignees = (task: any): string => {
  if (typeof task?.assigned_to_display === "string" && task.assigned_to_display.trim()) {
    return task.assigned_to_display.trim();
  }

  const fromMeta = Array.isArray(task?.assigned_users_meta)
    ? task.assigned_users_meta.map(formatUserName).filter(Boolean)
    : [];
  if (fromMeta.length > 0) return fromMeta.join(", ");

  const fromUsers = Array.isArray(task?.assigned_users)
    ? task.assigned_users.map(formatUserName).filter(Boolean)
    : [];
  if (fromUsers.length > 0) return fromUsers.join(", ");

  return "Unassigned";
};

const formatDate = (dateValue: any): string => {
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

export const generateTaskOverdueTemplate = (
  task: any,
  escalationLevel: number,
): string => {
  const assignees = formatAssignees(task);
  const originalDueDate = formatDate(task?.original_due_date || task?.due_date);
  const currentDueDate = formatDate(task?.due_date);
  const taskId = task?.id || "";

  const isLevel2 = escalationLevel >= 2;
  const escalationTitle = isLevel2
    ? "Level 2 Overdue Escalation (Department Head)"
    : "Level 1 Overdue Escalation (Reporting Manager)";
  const escalationMessage = isLevel2
    ? "This task is 3 or more days overdue and has been escalated to the Department Head for urgent resolution."
    : "This task is 1 or more days overdue and requires the attention of the assignee's Reporting Manager.";

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="background-color: #dc2626; color: #ffffff; padding: 14px 20px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 20px;">⚠️ ${escalationTitle}</h2>
      </div>

      <p>Dear Colleague,</p>
      <p>${escalationMessage}</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px 18px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 4px 0;"><strong>Task Title:</strong> ${task?.title || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Department:</strong> ${task?.department || "N/A"}</p>
        <p style="margin: 4px 0;"><strong>Priority:</strong> ${task?.priority || "Medium"}</p>
        <p style="margin: 4px 0;"><strong>Assigned To:</strong> ${assignees}</p>
        <p style="margin: 4px 0;"><strong>Original Due Date:</strong> ${originalDueDate}</p>
        <p style="margin: 4px 0; color: #dc2626;"><strong>Effective Due Date:</strong> ${currentDueDate}</p>
        ${task?.overdue_days ? `<p style="margin: 4px 0; font-weight: bold; color: #b91c1c;">Days Overdue: ${task.overdue_days} day(s)</p>` : ""}
        ${task?.description ? `<p style="margin: 8px 0 4px 0;"><strong>Description:</strong> ${task.description}</p>` : ""}
      </div>

      <p>Please take immediate necessary actions to expedite and complete this task.</p>
      
      <p style="margin-top: 24px;">
        <a href="https://erp.mtjfoundation.pk/tasks/view/${taskId}" style="background-color: #dc2626; color: #ffffff; padding: 10px 22px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Open Task in ERP
        </a>
      </p>
      
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        This is an automated overdue escalation notification from MTJ Foundation ERP.
      </p>
    </div>
  `;
};
