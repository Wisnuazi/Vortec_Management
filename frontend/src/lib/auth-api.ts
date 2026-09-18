const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type Theme = "light" | "dark" | "system";
export type Locale = "id" | "en";

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  isSuperAdmin: boolean;
  avatarUrl: string | null;
  roleIds: string[];
  roleTitles: string[];
  // DEC-067: union of all the user's roles' allowedBomTypes. Empty on
  // legacy clients that haven't re-fetched the user since the field
  // was added — see allowedBomTypesClient for the legacy fallback.
  allowedBomTypes?: BomType[];
  theme: Theme;
  locale: Locale;
};

// "Privileged" matches the backend's isPrivileged (auth.ts) — super admin,
// Operational Manager, or Director. The frontend mirror is kept here so
// UI gating stays in sync with the server-side gate (see DEC-050 for OM,
// DEC-051 for Director full oversight). All can*-helpers below should
// funnel through this for the "elevated" branch.
export function isPrivilegedClient(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleTitles.includes("Operational Manager") || user.roleTitles.includes("Director");
}

// DEC-070: dashboard variant drives the role-specific home screen.
// Each variant maps to a different set of panels + stat tiles; the
// QuickActions row is gone entirely — see DEC-070 audit item #3.
//
// Resolution order (most specific wins):
//   super_admin → "admin"        (full overview)
//   director    → "director"     (oversight, lighter than admin)
//   operational manager → "om"   (approvals + operational)
//   purchasing  → "purchasing"   (MR queue + vendor overview)
//   operational leader → "ol"    (kasbon submit + BOM view)
//   project manager → "pm"       (projects + approvals)
//   engineering (any engineer/QC/SW) → "engineer"  (tasks + own BOM type)
//   default → "default"          (empty)
export type DashboardVariant =
  | "admin"
  | "director"
  | "om"
  | "purchasing"
  | "ol"
  | "pm"
  | "engineer"
  | "default";

export function getDashboardVariant(user: AuthUser | null): DashboardVariant {
  if (!user) return "default";
  if (user.isSuperAdmin) return "admin";
  const titles = user.roleTitles;
  if (titles.includes("Director")) return "director";
  if (titles.includes("Operational Manager")) return "om";
  if (titles.includes("Purchasing")) return "purchasing";
  if (titles.includes("Operational Leader")) return "ol";
  if (titles.includes("Project Manager")) return "pm";
  const engineerTitles = ["Mechanical Engineer", "Electrical Engineer", "Software Development", "Quality Control"];
  if (engineerTitles.some((t) => titles.includes(t))) return "engineer";
  return "default";
}

// "Ops technical team" — the only set of users allowed to mutate
// the org chart and role membership (the Organization page's
// RoleList + OrgChart). The Operational Leader sits at the top of
// this subtree; everything below it is the engineering + QC + SD
// rows. The Operational Manager (the leader's parent) is the
// approver/monitor side and is intentionally NOT an editor here —
// they oversee but don't author the org structure. Director is
// also excluded (oversight, not authoring). Super admin bypasses.
//
// Pass the full Role[] (from useOrgRoles). With ~20 roles the
// tree walk is O(n) per call which is fine — we only call this
// once per page render.
export function canEditOrganization(
  user: AuthUser | null,
  roles: { id: string; title: string; parentId: string | null }[]
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;

  const olRole = roles.find((r) => r.title === "Operational Leader");
  if (!olRole) return false;

  const childrenOf = new Map<string | null, string[]>();
  for (const r of roles) {
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r.id);
    childrenOf.set(r.parentId, list);
  }
  const subtree = new Set<string>([olRole.id]);
  const queue: string[] = [olRole.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (!subtree.has(child)) {
        subtree.add(child);
        queue.push(child);
      }
    }
  }
  return user.roleIds.some((id) => subtree.has(id));
}

export function userHasRoleTitle(user: AuthUser | null, title: string): boolean {
  return !!user?.roleTitles.includes(title);
}

// Assets menu (add/edit/delete/photo) access — narrower than the general
// super-admin-only rule for other Organization content. See DEC-020/049.
const ASSET_MANAGER_ROLE_TITLES = ["Assets", "Operational Manager", "Operational Leader", "Director"];
export function canManageAssets(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return ASSET_MANAGER_ROLE_TITLES.some((title) => user.roleTitles.includes(title));
}

// Inventory menu (Material + StockMovement): holder of the "Inventory"
// role (per org chart) can create/edit/delete materials and record stock
// movements; super admin, OM, and Director too. Operational Leader added
// in DEC-061 — they're the ones who physically receive goods from
// Purchasing and need to record the stock IN/OUT. See DEC-051 + DEC-061.
export function canManageInventory(user: AuthUser | null): boolean {
  if (!user) return false;
  if (isPrivilegedClient(user)) return true;
  if (user.roleTitles.includes("Operational Leader")) return true;
  return user.roleTitles.includes("Inventory");
}

// Project Manager is blocked from the Asset and Inventory menus
// (DEC-061). Purchasing is also blocked (DEC-070) — Purchasing's
// day-to-day lives entirely in the /purchasing queue + vendor list.
// Director is NOT excluded (they have full oversight, DEC-051).
// Mirrors the backend's canAccessAssets / canAccessInventory — the
// sidebar uses these to hide the nav links, the page renders a 403
// if a user hand-crafts the URL.
export function canAccessAssets(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.roleTitles.includes("Project Manager")) return false;
  if (user.roleTitles.includes("Purchasing")) return false;
  return true;
}
export function canAccessInventory(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.roleTitles.includes("Project Manager")) return false;
  if (user.roleTitles.includes("Purchasing")) return false;
  return true;
}

// DEC-070: Approvals menu is for PM + OM + Director (super admin
// always). Purchasing no longer sees /approvals — their review lane
// is /purchasing. OL/Engineers don't approve BOM/docs/MR; they stay
// in the engineering lane.
export function canAccessApprovals(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (isPrivilegedClient(user)) return true; // OM + Director
  return user.roleTitles.includes("Project Manager");
}

// Purchasing menu: DEC-062 narrows this to super admin + Purchasing
// only. PM/OL/Director lose the top-level Purchasing link — their
// material-request access stays inline in the project page (see
// MaterialRequests component). Director is excluded (DEC-051) for
// the new narrow rule.
export function canViewPurchasing(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleTitles.includes("Purchasing");
}
export function canManagePurchasing(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleTitles.includes("Purchasing");
}

// Vendor menu: top-level navbar item (DEC-062), accessible to
// Purchasing + Operational Manager + super admin. PM/Engineer/OL
// don't manage vendors (they only consume the approved-BOM queue
// in the Purchasing menu). Director is excluded from the new
// narrow rule (DEC-051) for the same reason.
export function canAccessVendors(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (isPrivilegedClient(user) && user.roleTitles.includes("Operational Manager")) return true;
  return user.roleTitles.includes("Purchasing");
}

// Activity Log menu: super admin, Operational Manager, Operational Leader
// (added so OL can monitor technical-team productivity), and Director.
// See DEC-026 (OM/super admin), DEC-051 (Director), and the OL extension.
export function canViewActivityLog(user: AuthUser | null): boolean {
  if (!user) return false;
  if (isPrivilegedClient(user)) return true;
  return user.roleTitles.includes("Operational Leader");
}

// Document Templates menu: every authenticated role can view/download; only
// super admin, Operational Manager, or Director can CRUD the library.
// See DEC-034 and DEC-051.
export function canManageDocumentTemplates(user: AuthUser | null): boolean {
  return isPrivilegedClient(user);
}

// BOM menu: each type is owned by the engineering role that fills it in,
// reviewed by Project Manager, processed by Purchasing. Quality Control
// added to viewer set (DEC-051) so they can verify materials during
// functional/verification test; Director added (DEC-051) for oversight.
// QBOM added (DEC-064) for the Quality Control team.
export type BomType = "MBOM" | "EBOM" | "SBOM" | "QBOM";
export const BOM_OWNER_ROLE: Record<BomType, string> = {
  MBOM: "Mechanical Engineer",
  EBOM: "Electrical Engineer",
  SBOM: "Software Development",
  QBOM: "Quality Control",
};
const BOM_VIEWER_ROLE_TITLES = [
  "Mechanical Engineer",
  "Electrical Engineer",
  "Software Development",
  "Quality Control",
  "Project Manager",
  "Purchasing",
  "Operational Manager",
  "Operational Leader",
  "Director",
];
export function canViewBom(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return BOM_VIEWER_ROLE_TITLES.some((title) => user.roleTitles.includes(title));
}
export function canOwnBomType(user: AuthUser | null, bomType: BomType): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (isPrivilegedClient(user)) return true;
  // DEC-067: prefer the role-level `allowedBomTypes` array (data-driven,
  // editable by OM). Fall back to the historical BOM_OWNER_ROLE map so
  // the dashboard summary keeps working on legacy clients without the
  // new field populated.
  if (user.allowedBomTypes && user.allowedBomTypes.includes(bomType)) return true;
  return user.roleTitles.includes(BOM_OWNER_ROLE[bomType]);
}

// DEC-067: the set of BomTypes this user is allowed to submit. Drives
// the AddBomItemForm dropdown. Mirrors backend /api/bom/allowed-types
// for source-of-truth, with a legacy role-title fallback.
export function allowedBomTypesClient(user: AuthUser | null): BomType[] {
  if (!user) return [];
  if (user.isSuperAdmin) return ["MBOM", "EBOM", "SBOM", "QBOM"];
  if (isPrivilegedClient(user)) return ["MBOM", "EBOM", "SBOM", "QBOM"];
  if (user.allowedBomTypes && user.allowedBomTypes.length > 0) return user.allowedBomTypes;
  const out: BomType[] = [];
  for (const [bt, roleTitle] of Object.entries(BOM_OWNER_ROLE) as [BomType, string][]) {
    if (user.roleTitles.includes(roleTitle)) out.push(bt);
  }
  return out;
}

// DEC-067: who can close the project's BOM. PM + privileged
// (super admin / OM / Director). Mirrors the backend canCloseBom gate.
export function canCloseBomClient(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (isPrivilegedClient(user)) return true;
  return user.roleTitles.includes("Project Manager");
}

export function canReviewBom(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  // DEC-062: PM OR OM can approve a single item per click. Director
  // is excluded (oversight only, per DEC-051's pattern).
  if (user.roleTitles.includes("Project Manager")) return true;
  if (user.roleTitles.includes("Operational Manager")) return true;
  return false;
}
// DEC-062: ONLY Purchasing (and super admin) can change the purchasing
// status of a BOM item. PM/OM reviewed it, now it's purchasing's
// lane until ARRIVED.
export function canProcessBom(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.roleTitles.includes("Purchasing");
}

// DEC-064: PM or OM can approve/reject a ProjectDocument checklist
// item after the owning team marks it done. Uses the same gate as BOM
// review (canReviewBom) — same PM/OM reviewer set.
export function canReviewDocument(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.roleTitles.includes("Project Manager")) return true;
  if (user.roleTitles.includes("Operational Manager")) return true;
  return false;
}

// DEC-064: assigning a user to a role is sensitive — only super
// admin + Director + OM can do it.
export function canManageUserRoleAssignments(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.roleTitles.includes("Director")) return true;
  if (user.roleTitles.includes("Operational Manager")) return true;
  return false;
}

// DEC-064: floor layout description (physical layout + security notes)
// is sensitive — only super admin + Director + OM can edit it.
export function canEditFloorLayout(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.roleTitles.includes("Director")) return true;
  if (user.roleTitles.includes("Operational Manager")) return true;
  return false;
}

// Operasional menu (Daily Report, Kasbon, Realisasi Kasbon): everyone
// except Project Manager + Purchasing (DEC-070). PM's day-to-day already
// lives entirely in Projects/Tasks/BOM; Purchasing's lane is the
// /purchasing queue. See DEC-041; Director added per DEC-051.
export function canAccessOperational(user: AuthUser | null): boolean {
  if (!user) return false;
  if (isPrivilegedClient(user)) return true;
  if (user.roleTitles.includes("Project Manager")) return false;
  if (user.roleTitles.includes("Purchasing")) return false;
  return true;
}
export function canMonitorOperational(user: AuthUser | null): boolean {
  if (!user) return false;
  if (isPrivilegedClient(user)) return true;
  return user.roleTitles.includes("Operational Leader");
}
export function canReviewKasbon(user: AuthUser | null): boolean {
  if (!user) return false;
  if (isPrivilegedClient(user)) return true;
  return user.roleTitles.includes("Operational Manager");
}
// Kasbon itself is narrower than the rest of the Operasional menu: only
// Operational Manager and Operational Leader (or super admin) — the
// Operational Leader requests/itemizes kasbon, the Operational Manager
// reviews/approves it. Same role set as canMonitorOperational; kept as
// its own named function since the two checks answer different questions
// (this gates access at all; canMonitorOperational gates "see everyone's
// vs. just your own" once inside).
export function canAccessKasbon(user: AuthUser | null): boolean {
  return canMonitorOperational(user);
}
// DEC-061: only the OM side opens new phases. OL submits against an
// existing OPEN phase; they don't create their own.
export function canCreateKasbonPhase(user: AuthUser | null): boolean {
  return canReviewKasbon(user);
}

export type ManagedUser = AuthUser & { createdAt: string };

async function apiFetch<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authApi = {
  login: (identifier: string, password: string) =>
    apiFetch<{ token: string; user: AuthUser }>("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  me: (token: string) => apiFetch<{ user: AuthUser }>("/auth/me", token),
  updateMe: (
    token: string,
    data: Partial<{ name: string; theme: Theme; locale: Locale; password: string; avatarUrl: string | null }>
  ) =>
    apiFetch<{ user: AuthUser }>("/auth/me", token, { method: "PATCH", body: JSON.stringify(data) }),
};

export type BasicUser = { id: string; name: string; roleTitles: string[] };

export const basicUsersApi = {
  list: (token: string) => apiFetch<BasicUser[]>("/users/basic", token),
};

export const usersApi = {
  list: (token: string) => apiFetch<ManagedUser[]>("/users", token),
  create: (
    token: string,
    data: {
      email: string;
      username: string | null;
      password: string;
      name: string;
      roleIds: string[];
      isSuperAdmin: boolean;
    }
  ) => apiFetch<ManagedUser>("/users", token, { method: "POST", body: JSON.stringify(data) }),
  update: (
    token: string,
    id: string,
    data: Partial<{ name: string; username: string | null; roleIds: string[]; isSuperAdmin: boolean; password: string }>
  ) => apiFetch<ManagedUser>(`/users/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (token: string, id: string) => apiFetch<void>(`/users/${id}`, token, { method: "DELETE" }),
};
