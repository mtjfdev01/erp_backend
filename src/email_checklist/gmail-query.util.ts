/** Gmail search `after:` uses YYYY/M/D (UTC). */
export function formatGmailAfterDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y}/${m}/${d}`;
}

export function buildUnreadSinceQuery(syncFrom: Date): string {
  return `is:unread after:${formatGmailAfterDate(syncFrom)}`;
}
