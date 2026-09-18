// Shared urgency categorization for due-date-driven UI (Notifications) —
// red/urgent, orange/warning, blue/info, matching standard UI/UX severity
// conventions. See DEC-028.
export type Severity = "urgent" | "warning" | "info";

const WARNING_WITHIN_DAYS = 1;

export function dateSeverity(dateIso: string | null, overdue: boolean): Severity {
  if (!dateIso) return "info";
  if (overdue) return "urgent";
  const days = (new Date(dateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days <= WARNING_WITHIN_DAYS) return "warning";
  return "info";
}
