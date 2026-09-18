import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set — check backend/.env");
}

const TOKEN_TTL = "12h";

export type AuthTokenPayload = {
  sub: string; // user id
  isSuperAdmin: boolean;
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: TOKEN_TTL });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export interface AuthedRequest extends Request {
  authUser?: { id: string; isSuperAdmin: boolean; name: string };
}

const LAST_SEEN_THROTTLE_MS = 30_000;

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as AuthTokenPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    req.authUser = { id: user.id, isSuperAdmin: user.isSuperAdmin, name: user.name };

    // Best-effort presence tracking for the Activity Log's online-status
    // panel — throttled so it's not a write on every single request.
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      prisma.user
        .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
        .catch((err) => console.error("Failed to update lastSeenAt:", err));
    }

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Strictly the real DB flag — used only where an action must stay
// super-admin-exclusive (User Management: routes/users.ts) or where the
// literal flag itself is what's being read/written (JWT payload, a user's
// own isSuperAdmin field, self-demotion protection). Everywhere else that
// used to gate on "super admin only" now uses requirePrivileged/
// isPrivileged below instead — see DEC-050.
export function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser?.isSuperAdmin) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

// --- Multi-role helpers ---------------------------------------------------
// A user can hold multiple roles (UserRole join table). Permission checks
// resolve against the full set of a user's roleIds/titles, not a single one.

export async function getUserRoles(userId: string): Promise<{ id: string; title: string; allowedBomTypes: string[] }[]> {
  // DEC-067: also pull allowedBomTypes so serializeUser can union them
  // for the frontend's MaterialRequest / BomItem dropdown gates. Older
  // callers that only read .id / .title are unaffected.
  const rows = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { id: true, title: true, allowedBomTypes: true } } },
  });
  return rows.map((r) => r.role);
}

// Operational Manager and Director have the same feature access as super
// admin everywhere in the app EXCEPT User Management (routes/users.ts,
// which stays requireSuperAdmin/isSuperAdmin-only) — see DEC-050 for OM,
// DEC-051 for Director (full oversight). This is the one place that
// equivalence is defined; every other route's super-admin-bypass check
// should call this (or requirePrivileged) instead of reading
// `authUser.isSuperAdmin` directly, so the exception list stays exactly
// one file.
export async function isPrivileged(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await userHasRoleTitle(authUser.id, "Operational Manager")) return true;
  return userHasRoleTitle(authUser.id, "Director");
}

export async function requirePrivileged(req: AuthedRequest, res: Response, next: NextFunction) {
  if (await isPrivileged(req.authUser!)) return next();
  res.status(403).json({ error: "Hanya Operational Manager atau super admin yang bisa mengakses ini" });
}

export async function userHasRoleId(userId: string, roleId: string): Promise<boolean> {
  const count = await prisma.userRole.count({ where: { userId, roleId } });
  return count > 0;
}

export async function userHasRoleTitle(userId: string, title: string): Promise<boolean> {
  const count = await prisma.userRole.count({ where: { userId, role: { title } } });
  return count > 0;
}

export async function userHasAnyRoleTitle(userId: string, titles: string[]): Promise<boolean> {
  const count = await prisma.userRole.count({ where: { userId, role: { title: { in: titles } } } });
  return count > 0;
}

// Subtree membership — the user holds any role that is at or below
// the given role title in the org tree. Used by `canEditOrganization`:
// the ops-technical team (Operational Leader + all roles that report
// into it: Electrical/Mechanical/QC/Software engineers) is the only
// set of users allowed to mutate the org chart and role membership.
// The Operational Manager sits ABOVE Operational Leader in the tree
// and is intentionally excluded from this check — they're the
// approver/monitor side, not the org-structure editor. Director is
// also excluded (oversight, not authoring). Super admin bypasses.
export async function userInRoleSubtree(userId: string, rootTitle: string): Promise<boolean> {
  const root = await prisma.role.findFirst({ where: { title: rootTitle } });
  if (!root) return false;
  // Walk down the tree from the root. With ~20 roles this is
  // O(n) per call which is fine for the per-request check (the
  // alternative — a recursive CTE — adds DB complexity for a hot
  // path that runs once per protected request).
  const all = await prisma.role.findMany({ select: { id: true, parentId: true } });
  const childrenOf = new Map<string | null, string[]>();
  for (const r of all) {
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r.id);
    childrenOf.set(r.parentId, list);
  }
  const subtree = new Set<string>([root.id]);
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (!subtree.has(child)) {
        subtree.add(child);
        queue.push(child);
      }
    }
  }
  const count = await prisma.userRole.count({
    where: { userId, roleId: { in: Array.from(subtree) } },
  });
  return count > 0;
}

// Organization-page editor. Use this in routes that mutate roles,
// role membership, jobdesk, supervisors. Not used for the whole
// backend (use `isPrivileged` for global super-admin-style gates).
// See DEC-060.
//
// DEC-064: widens from just the OL-subtree to include Operational
// Manager (the parent — they approve org changes) and Director
// (oversight per DEC-051). OM and Director don't edit the tree
// structure itself; they sign off on it.
export async function canEditOrganization(authUser: {
  id: string;
  isSuperAdmin: boolean;
}): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await userHasRoleTitle(authUser.id, "Operational Manager")) return true;
  if (await userHasRoleTitle(authUser.id, "Director")) return true;
  return userInRoleSubtree(authUser.id, "Operational Leader");
}

export async function requireOrgEditor(req: AuthedRequest, res: Response, next: NextFunction) {
  if (await canEditOrganization(req.authUser!)) return next();
  res.status(403).json({
    error: "Hanya super admin, Operational Manager, Director, atau tim Operational Leader ke bawah yang bisa memodifikasi struktur organisasi",
  });
}

// DEC-064: user picker in role management (Daftar Role → assign/unassign
// users to a role) narrows to super admin + Director + OM — not OL or
// engineers, because assigning a user to a role is a sensitive operation.
export async function canManageUserRoleAssignments(authUser: {
  id: string;
  isSuperAdmin: boolean;
}): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await userHasRoleTitle(authUser.id, "Operational Manager")) return true;
  return userHasRoleTitle(authUser.id, "Director");
}

export async function requireCanManageUserRoleAssignments(req: AuthedRequest, res: Response, next: NextFunction) {
  if (await canManageUserRoleAssignments(req.authUser!)) return next();
  res.status(403).json({
    error: "Hanya super admin, Operational Manager, atau Director yang bisa mengatur anggota role",
  });
}

// DEC-064: floor layout description is sensitive content (physical layout
// and security notes). Only super admin + Director + OM can edit it.
// Everyone else can view.
export async function canEditFloorLayout(authUser: {
  id: string;
  isSuperAdmin: boolean;
}): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await userHasRoleTitle(authUser.id, "Operational Manager")) return true;
  return userHasRoleTitle(authUser.id, "Director");
}

export async function requireCanEditFloorLayout(req: AuthedRequest, res: Response, next: NextFunction) {
  if (await canEditFloorLayout(req.authUser!)) return next();
  res.status(403).json({
    error: "Hanya super admin, Operational Manager, atau Director yang bisa mengedit denah gedung",
  });
}

// DEC-064: PM or OM can approve/reject a ProjectDocument after the
// owning team marks it done. This is separate from general privileged
// access — anyone who can review BOM can review project documents too.
export async function canReviewDocument(authUser: {
  id: string;
  isSuperAdmin: boolean;
}): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await userHasRoleTitle(authUser.id, "Project Manager")) return true;
  return userHasRoleTitle(authUser.id, "Operational Manager");
}

// A holder of the "Inventory" role can manage materials and stock
// movements (consistent with the role's jobdesk in the org chart:
// "Mencatat keluar-masuk barang" / "stock opname"). Operational Leader
// is also a manager in the new model (DEC-061) — they're the ones
// physically receiving goods from Purchasing and recording the stock
// IN/OUT for their team. Mirrors the narrow-by-role pattern of
// requireAssetManager (DEC-020/049) and requirePurchasingEditor
// (DEC-022) — see DEC-051 + DEC-061.
export async function canManageInventory(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  if (await isPrivileged(authUser)) return true;
  if (await userHasRoleTitle(authUser.id, "Operational Leader")) return true;
  return userHasRoleTitle(authUser.id, "Inventory");
}

export async function requireInventoryManager(req: AuthedRequest, res: Response, next: () => void) {
  if (await canManageInventory(req.authUser!)) return next();
  res.status(403).json({ error: "Hanya tim Inventory, Operational Leader/Manager, atau super admin yang bisa mengubah data ini" });
}

// Project Manager has no business with the Asset or Inventory menus —
// their day-to-day is entirely in Projects/Tasks/BOM. Mirrors the
// pre-existing `canAccessOperational` block (DEC-041, excludes PM).
// Director is NOT excluded because they have full oversight (DEC-051).
// Applied to the nav (Sidebar) and to the /api/floors and
// /api/materials root endpoints as a 403, so a Project Manager who
// hand-crafts the URL still gets rejected. See DEC-061.
async function isProjectManager(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  return userHasRoleTitle(authUser.id, "Project Manager");
}

export async function canAccessAssets(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await isProjectManager(authUser)) return false;
  return true;
}

export async function canAccessInventory(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  if (authUser.isSuperAdmin) return true;
  if (await isProjectManager(authUser)) return false;
  return true;
}

export async function requireNotProjectManager(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.authUser?.isSuperAdmin) return next();
  if (!(await isProjectManager(req.authUser!))) return next();
  res.status(403).json({ error: "Menu ini tidak tersedia untuk Project Manager" });
}
