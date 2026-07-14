export const generateTaskOverdueTemplate = (
  task: any,
  _escalationLevel: number,
  recipientName?: string,
): string => {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

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
            <h1>Task Overdue Alert</h1>
          </div>
          <div class="content">
            <p>${greeting}</p>
            <p>Your assigned task is overdue and requires immediate attention.</p>
            <div class="details">
              <p><strong>Title:</strong> ${task.title}</p>
              <p><strong>Due Date:</strong> ${task.due_date}</p>
              <p><strong>Priority:</strong> ${task.priority}</p>
            </div>
            <p>Please review and complete it as soon as possible.</p>
          </div>
        </div>
      </body>
      </html>
    `;
};
