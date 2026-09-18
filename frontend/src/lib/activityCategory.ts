// Categorizes an ActivityLog entry's `action` (e.g. "role.create",
// "task.delete") by what kind of change it represents, for color-coded
// badges on the Activity Log feed. See DEC-028.
export type ActivityCategory = "create" | "update" | "delete" | "decision" | "auth";

const SUFFIX_CATEGORY: [suffix: string, category: ActivityCategory][] = [
  ["auth.login", "auth"],
  ["auth.loginFailed", "auth"],
  [".create", "create"],
  [".submit", "create"],
  [".stockIn", "create"],
  [".delete", "delete"],
  [".stockOut", "delete"],
  [".approvalDecision", "decision"],
  [".review", "decision"],
  [".process", "decision"],
  [".statusChange", "decision"],
  [".update", "update"],
  [".rename", "update"],
];

export function categorizeActivity(action: string): ActivityCategory {
  for (const [suffix, category] of SUFFIX_CATEGORY) {
    if (action.endsWith(suffix)) return category;
  }
  return "update";
}

// A second, independent axis for the Activity Log's filter tabs — "what
// area of the app was this about", as opposed to categorizeActivity's
// "what kind of change was this". See DEC-029. "operational" (DailyReport/
// KasbonPhase/KasbonItem) was split out from the generic "crud" bucket
// per explicit request so Operasional-menu activity can be filtered on
// its own, separate from Role/Employee/Asset/Material/User/Vendor CRUD.
export type ActivityDomain = "login" | "project" | "operational" | "crud";

const PROJECT_ENTITY_TYPES = new Set(["Project", "Task", "MaterialRequest"]);
const OPERATIONAL_ENTITY_TYPES = new Set(["DailyReport", "KasbonPhase", "KasbonItem"]);

export function activityDomain(entityType: string): ActivityDomain {
  if (entityType === "Auth") return "login";
  if (PROJECT_ENTITY_TYPES.has(entityType)) return "project";
  if (OPERATIONAL_ENTITY_TYPES.has(entityType)) return "operational";
  return "crud";
}
