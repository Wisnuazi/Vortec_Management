export type Employee = {
  id: string;
  name: string;
};

export type JobdeskItem = {
  id: string;
  text: string;
};

export type Role = {
  id: string;
  title: string;
  parentId: string | null;
  jobdesk: JobdeskItem[];
  jobDescription: string;
  // A role's members are the real User accounts whose `UserRole`
  // includes this role — see DEC-059. The shape is the same as the
  // historical `Employee` table it replaced, so existing UI keeps
  // working, but `id` is now a User.id (which is what gets sent to
  // POST/DELETE /:id/users/:userId).
  employees: Employee[];
  // Additive "also supervised by" edges, separate from parentId — see DEC-019.
  coSupervisorIds: string[];
  // Set only for a floor-scoped Assets role (e.g. "Assets Lantai 1") — see
  // DEC-049. Read-only informational display; not editable through this API.
  floorId: string | null;
  floorLabel: string | null;
};
