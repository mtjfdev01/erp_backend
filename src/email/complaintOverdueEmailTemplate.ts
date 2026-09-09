const formatUserName = (user: any): string | null => {
  if (!user || typeof user !== "object") return null;
  const named = String(user.name || "").trim();
  if (named) return named;
  const fromParts = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  if (fromParts) return fromParts;
  const email = String(user.email || "").trim();
  return email || null;
};

const formatAssignees = (complaint: any): string => {
  if (
    typeof complaint?.assigned_to_display === "string" &&
    complaint.assigned_to_display.trim()
  ) {
    return complaint.assigned_to_display.trim();
  }

  const fromMeta = Array.isArray(complaint?.assigned_users_meta)
    ? complaint.assigned_users_meta.map(formatUserName).filter(Boolean)
    : [];
  if (fromMeta.length > 0) return fromMeta.join(", ");

  const fromUsers = Array.isArray(complaint?.assigned_users)
    ? complaint.assigned_users.map(formatUserName).filter(Boolean)
    : [];
  if (fromUsers.length > 0) return fromUsers.join(", ");

  return "Unassigned";
};

export const generateComplaintOverdueTemplate = (
  complaint: any,
  escalationLevel: number,
): string => {
  const assignees = formatAssignees(complaint);

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #d9534f; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .details { background-color: white; padding: 15px; border-radius: 5px; border-left: 5px solid #d9534f; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Complaint Overdue Alert</h1>
          </div>
          <div class="content">
            <p><strong>Escalation Level: ${escalationLevel}</strong></p>
            <p>The following complaint is overdue and requires immediate attention:</p>
            <div class="details">
              <p><strong>Title:</strong> ${complaint.title}</p>
              <p><strong>Due Date:</strong> ${complaint.due_date}</p>
              <p><strong>Priority:</strong> ${complaint.priority}</p>
              <p><strong>Assigned To:</strong> ${assignees}</p>
            </div>
            <p>Please take necessary actions.</p>
          </div>
        </div>
      </body>
      </html>
    `;
};
