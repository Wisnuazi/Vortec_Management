import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireOrgEditor, requireCanManageUserRoleAssignments, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

// `Role.employees` is computed from the `UserRole` join table (one
// source of truth) rather than a separate `Employee` table that could
// drift out of sync with the user's actual role list — see DEC-059.
// The include below fetches the role's `UserRole`s with the related
// `User` row, and `serializeRole` projects them down to the same
// `{id, name}` shape the frontend used to see from `Employee` (so
// existing UI callsites that read `role.employees` still work).
const roleInclude = {
  userRoles: { include: { user: { select: { id: true, name: true } } } },
  jobdesk: { orderBy: { order: "asc" as const } },
  supervisedBy: { select: { supervisorId: true } },
  floor: { select: { id: true, label: true } },
};

function serializeRole(role: {
  id: string;
  title: string;
  parentId: string | null;
  jobDescription: string;
  userRoles: { userId: string; user: { id: string; name: string } }[];
  jobdesk: { id: string; text: string }[];
  supervisedBy: { supervisorId: string }[];
  floorId: string | null;
  floor: { id: string; label: string } | null;
}) {
  return {
    id: role.id,
    title: role.title,
    parentId: role.parentId,
    jobDescription: role.jobDescription,
    // Computed: every User whose `UserRole` includes this role id.
    // Same `{id, name}` shape the old `Employee` table produced, so
    // the frontend's `role.employees` reading code keeps working.
    employees: role.userRoles.map((ur) => ({ id: ur.user.id, name: ur.user.name })),
    jobdesk: role.jobdesk.map((j) => ({ id: j.id, text: j.text })),
    coSupervisorIds: role.supervisedBy.map((s) => s.supervisorId),
    // Read-only: an Assets role scoped to one floor (e.g. "Assets Lantai 1")
    // — see DEC-049. Not editable through this API; set structurally via
    // the seed/migration that creates these roles.
    floorId: role.floorId,
    floorLabel: role.floor?.label ?? null,
  };
}

rolesRouter.get("/", async (_req: AuthedRequest, res: Response) => {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { createdAt: "asc" } });
  res.json(roles.map(serializeRole));
});

rolesRouter.post("/", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  const { parentId, title } = req.body as { parentId?: string | null; title?: string };
  const trimmed = title?.trim();
  if (!trimmed) return res.status(400).json({ error: "title is required" });

  const role = await prisma.role.create({
    data: { title: trimmed, parentId: parentId ?? null },
    include: roleInclude,
  });
  logActivityFor(req, {
    action: "role.create",
    entityType: "Role",
    entityId: role.id,
    description: `Menambahkan jabatan "${role.title}"`,
  });
  res.status(201).json(serializeRole(role));
});

rolesRouter.patch("/:id", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  const { title } = req.body as { title?: string };
  const trimmed = title?.trim();
  if (!trimmed) return res.status(400).json({ error: "title is required" });

  try {
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { title: trimmed },
      include: roleInclude,
    });
    logActivityFor(req, {
      action: "role.rename",
      entityType: "Role",
      entityId: role.id,
      description: `Mengubah nama jabatan menjadi "${role.title}"`,
    });
    res.json(serializeRole(role));
  } catch {
    res.status(404).json({ error: "role not found" });
  }
});

rolesRouter.patch("/:id/job-description", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  const { jobDescription } = req.body as { jobDescription?: string };
  try {
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { jobDescription: jobDescription ?? "" },
      include: roleInclude,
    });
    res.json(serializeRole(role));
  } catch {
    res.status(404).json({ error: "role not found" });
  }
});

// Sets the full list of "also supervises" edges for this role — additive to
// the parentId tree, not a replacement (see DEC-019). Replace-set semantics.
rolesRouter.put("/:id/supervisors", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  const { supervisorIds } = req.body as { supervisorIds?: string[] };
  if (!Array.isArray(supervisorIds)) return res.status(400).json({ error: "supervisorIds must be an array" });

  const ids = [...new Set(supervisorIds)].filter((id) => id !== req.params.id);
  if (ids.length > 0) {
    const found = await prisma.role.count({ where: { id: { in: ids } } });
    if (found !== ids.length) return res.status(404).json({ error: "one or more supervisor roles not found" });
  }

  try {
    await prisma.$transaction([
      prisma.roleSupervision.deleteMany({ where: { roleId: req.params.id, supervisorId: { notIn: ids } } }),
      ...ids.map((supervisorId) =>
        prisma.roleSupervision.upsert({
          where: { roleId_supervisorId: { roleId: req.params.id, supervisorId } },
          update: {},
          create: { roleId: req.params.id, supervisorId },
        })
      ),
    ]);
    const role = await prisma.role.findUniqueOrThrow({ where: { id: req.params.id }, include: roleInclude });
    res.json(serializeRole(role));
  } catch {
    res.status(404).json({ error: "role not found" });
  }
});

rolesRouter.delete("/:id", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, select: { title: true } });
    await prisma.role.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "role.delete",
      entityType: "Role",
      entityId: req.params.id,
      description: `Menghapus jabatan "${role?.title ?? req.params.id}" beserta seluruh jabatan di bawahnya`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "role not found" });
  }
});

// Add a user to a role by inserting a UserRole row. The same row also
// shows up in the user's own role list (auth.ts's getUserRoles queries
// the same table), so adding to a role here is what gives the user
// that role's permissions — single source of truth.
//
// DEC-064: assigning a user to a role is sensitive — only super admin +
// Director + OM can do it (not OL or engineers, who can still use the
// org structure tools via requireOrgEditor).
//
// Idempotent: re-adding a user that's already in the role is a no-op
// (the @@unique([userId, roleId]) constraint on UserRole catches it).
rolesRouter.post("/:id/users/:userId", requireCanManageUserRoleAssignments, async (req: AuthedRequest, res: Response) => {
  const { userId } = req.params;
  const [role, user] = await Promise.all([
    prisma.role.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
  ]);
  if (!role) return res.status(404).json({ error: "role not found" });
  if (!user) return res.status(404).json({ error: "user not found" });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });

  const updated = await prisma.role.findUniqueOrThrow({ where: { id: role.id }, include: roleInclude });
  logActivityFor(req, {
    action: "role.memberAdd",
    entityType: "Role",
    entityId: role.id,
    description: `Menambahkan ${user.name} ke jabatan ${role.title}`,
  });
  res.status(201).json(serializeRole(updated));
});

// Remove a user from a role by deleting the UserRole row. The user's
// permission set updates immediately on the next auth check (no
// caching layer between UserRole and getUserRoles). Uses the same
// DEC-064 narrow gate as the POST (add) above.
rolesRouter.delete("/:id/users/:userId", requireCanManageUserRoleAssignments, async (req: AuthedRequest, res: Response) => {
  const { userId } = req.params;
  const [role, user] = await Promise.all([
    prisma.role.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
  ]);
  if (!role) return res.status(404).json({ error: "role not found" });
  if (!user) return res.status(404).json({ error: "user not found" });

  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });

  const updated = await prisma.role.findUniqueOrThrow({ where: { id: role.id }, include: roleInclude });
  logActivityFor(req, {
    action: "role.memberRemove",
    entityType: "Role",
    entityId: role.id,
    description: `Menghapus ${user.name} dari jabatan ${role.title}`,
  });
  res.json(serializeRole(updated));
});

rolesRouter.post("/:id/jobdesk", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  const { text } = req.body as { text?: string };
  const trimmed = text?.trim();
  if (!trimmed) return res.status(400).json({ error: "text is required" });

  try {
    const last = await prisma.jobdesk.findFirst({
      where: { roleId: req.params.id },
      orderBy: { order: "desc" },
    });
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: { jobdesk: { create: { text: trimmed, order: (last?.order ?? -1) + 1 } } },
      include: roleInclude,
    });
    res.status(201).json(serializeRole(role));
  } catch {
    res.status(404).json({ error: "role not found" });
  }
});

// Edit an existing jobdesk item in place (text + optional reorder).
// Used by the inline-edit affordance in the Organization → Daftar Role
// view; the same id, order field drives the bullet list rendering.
rolesRouter.patch("/:id/jobdesk/:jobdeskId", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  const { text } = req.body as { text?: string };
  const trimmed = text?.trim();
  if (trimmed !== undefined && !trimmed) return res.status(400).json({ error: "text cannot be empty" });

  try {
    const item = await prisma.jobdesk.findUnique({ where: { id: req.params.jobdeskId } });
    if (!item || item.roleId !== req.params.id) {
      return res.status(404).json({ error: "jobdesk item not found in this role" });
    }
    await prisma.jobdesk.update({
      where: { id: req.params.jobdeskId },
      data: trimmed !== undefined ? { text: trimmed } : {},
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { id: req.params.id }, include: roleInclude });
    res.json(serializeRole(role));
  } catch {
    res.status(404).json({ error: "jobdesk item or role not found" });
  }
});

rolesRouter.delete("/:id/jobdesk/:jobdeskId", requireOrgEditor, async (req: AuthedRequest, res: Response) => {
  try {
    await prisma.jobdesk.delete({ where: { id: req.params.jobdeskId } });
    const role = await prisma.role.findUniqueOrThrow({ where: { id: req.params.id }, include: roleInclude });
    res.json(serializeRole(role));
  } catch {
    res.status(404).json({ error: "jobdesk item or role not found" });
  }
});
