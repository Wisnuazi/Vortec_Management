import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, userHasAnyRoleTitle, userHasRoleTitle, isPrivileged, getUserRoles, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";
import { notifyBomEvent } from "../lib/notifications";

export const bomRouter = Router();
bomRouter.use(requireAuth);

// DEC-064 adds QBOM for the Quality Control team.
export const BOM_TYPES = ["MBOM", "EBOM", "SBOM", "QBOM"] as const;
export type BomType = (typeof BOM_TYPES)[number];

// DEC-067: each role carries its own `allowedBomTypes: BomType[]` so OM
// can adjust per-role submit permissions in the org UI without code
// change. We still keep a fallback "default owner role per type" so the
// existing dashboard summary / viewer-gate UI (which renders labels by
// role title) keeps working when the role array is empty / legacy.
const DEFAULT_BOM_OWNER_ROLE: Record<BomType, string> = {
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

async function requireBomViewer(req: AuthedRequest, res: Response, next: () => void) {
  if (req.authUser!.isSuperAdmin) return next();
  if (await userHasAnyRoleTitle(req.authUser!.id, BOM_VIEWER_ROLE_TITLES)) return next();
  res.status(403).json({ error: "Halaman ini khusus untuk tim engineering dan jajaran manajerial terkait" });
}

// DEC-067: a user can submit a bomType if either (a) they hold a
// privileged role (super admin / OM / Director) — full access — or
// (b) one of their roles lists that BomType in `allowedBomTypes`. PM
// is special: they get the full set via migration backfill (full
// backfill list lives in DEC-067 / migration 20260916050000).
async function canOwnBomType(authUser: { id: string; isSuperAdmin: boolean }, bomType: BomType) {
  if (await isPrivileged(authUser)) return true;
  const roles = await getUserRoles(authUser.id);
  for (const role of roles) {
    const allowed = (role as { allowedBomTypes?: string[] }).allowedBomTypes;
    if (allowed && allowed.includes(bomType)) return true;
  }
  return false;
}

// Convenience for the UI — returns the types a user is allowed to
// submit (used by the AddBomItemForm dropdown).
export async function allowedBomTypesFor(authUser: { id: string; isSuperAdmin: boolean }): Promise<BomType[]> {
  if (await isPrivileged(authUser)) return [...BOM_TYPES];
  const roles = await getUserRoles(authUser.id);
  const set = new Set<BomType>();
  for (const role of roles) {
    const allowed = (role as { allowedBomTypes?: string[] }).allowedBomTypes;
    if (!allowed) continue;
    for (const t of allowed) {
      if (BOM_TYPES.includes(t as BomType)) set.add(t as BomType);
    }
  }
  return Array.from(set);
}

async function canReviewBom(authUser: { id: string; isSuperAdmin: boolean }) {
  if (await isPrivileged(authUser)) return true;
  return userHasRoleTitle(authUser.id, "Project Manager");
}

async function canProcessBom(authUser: { id: string; isSuperAdmin: boolean }) {
  if (await isPrivileged(authUser)) return true;
  return userHasRoleTitle(authUser.id, "Purchasing");
}

type BomItemRow = {
  id: string;
  projectId: string;
  project: { id: string; name: string; bomClosed: boolean };
  bomType: string;
  name: string;
  quantity: number;
  unit: string;
  price: number | null;
  notes: string;
  status: string;
  submittedByUser: { id: string; name: string };
  submittedAt: Date;
  approvedByUser: { id: string; name: string } | null;
  approvedAt: Date | null;
  approveNote: string;
  processedByUser: { id: string; name: string } | null;
  purchasingUpdatedAt: Date | null;
  purchaseNote: string;
  createdAt: Date;
  updatedAt: Date;
};

function serializeBomItem(i: BomItemRow) {
  return {
    id: i.id,
    projectId: i.project.id,
    projectName: i.project.name,
    // DEC-067: so the project BOM tab can show the "BOM closed" pill and
    // hide the add form without a second fetch.
    projectBomClosed: i.project.bomClosed,
    bomType: i.bomType,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    price: i.price,
    notes: i.notes,
    status: i.status,
    submittedByUserId: i.submittedByUser.id,
    submittedByUserName: i.submittedByUser.name,
    submittedAt: i.submittedAt,
    approvedByUserName: i.approvedByUser?.name ?? null,
    approvedAt: i.approvedAt,
    approveNote: i.approveNote,
    processedByUserName: i.processedByUser?.name ?? null,
    purchasingUpdatedAt: i.purchasingUpdatedAt,
    purchaseNote: i.purchaseNote,
  };
}

const bomItemInclude = {
  project: { select: { id: true, name: true, bomClosed: true } },
  submittedByUser: { select: { id: true, name: true } },
  approvedByUser: { select: { id: true, name: true } },
  processedByUser: { select: { id: true, name: true } },
};

// DEC-067: returns the BomTypes this user is allowed to submit (drives
// the AddBomItemForm dropdown on the project BOM tab).
bomRouter.get("/allowed-types", async (req: AuthedRequest, res: Response) => {
  const types = await allowedBomTypesFor(req.authUser!);
  res.json({ types });
});

bomRouter.get("/", requireBomViewer, async (req: AuthedRequest, res: Response) => {
  const { projectId, bomType } = req.query as { projectId?: string; bomType?: string };
  const items = await prisma.bomItem.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(bomType && BOM_TYPES.includes(bomType as BomType) ? { bomType: bomType as BomType } : {}),
    },
    orderBy: { submittedAt: "desc" },
    include: bomItemInclude,
  });
  res.json(items.map(serializeBomItem));
});

bomRouter.post("/", async (req: AuthedRequest, res: Response) => {
  const { projectId, bomType, name, quantity, unit, price, notes } = req.body as {
    projectId?: string;
    bomType?: string;
    name?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    notes?: string;
  };
  if (!bomType || !BOM_TYPES.includes(bomType as BomType)) return res.status(400).json({ error: "invalid bomType" });
  if (!(await canOwnBomType(req.authUser!, bomType as BomType))) {
    return res.status(403).json({ error: `Anda tidak memiliki akses untuk mengajukan ${bomType}. Hubungi OM jika ini keliru.` });
  }
  const trimmedName = name?.trim();
  if (!projectId || !trimmedName || !quantity || quantity <= 0 || !unit?.trim()) {
    return res.status(400).json({ error: "projectId, name, quantity, and unit are required" });
  }
  if (price !== undefined && price < 0) {
    return res.status(400).json({ error: "price must not be negative" });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, bomClosed: true } });
  if (!project) return res.status(404).json({ error: "project not found" });
  // DEC-067: once PM/OM has closed the project's BOM, no new items
  // may be added. The rekap Excel + document auto-check is the final
  // deliverable for that BOM.
  if (project.bomClosed) {
    return res.status(400).json({ error: "BOM project ini sudah di-close. Tidak bisa menambah item baru." });
  }

  const item = await prisma.bomItem.create({
    data: {
      projectId,
      bomType: bomType as BomType,
      name: trimmedName,
      quantity,
      unit: unit.trim(),
      price: price ?? null,
      notes: notes ?? "",
      submittedByUserId: req.authUser!.id,
    },
    include: bomItemInclude,
  });
  logActivityFor(req, {
    action: "bomItem.create",
    entityType: "BomItem",
    entityId: item.id,
    description: `Mengajukan item ${bomType} "${item.name}" (project "${item.project.name}")`,
  });
  // DEC-063: notify PM + OM that there's a new item to review.
  await notifyBomEvent(
    req.authUser!.id,
    {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      projectId: item.projectId,
      submittedByUserId: item.submittedByUserId,
    },
    "submitted"
  );
  res.status(201).json(serializeBomItem(item));
});

bomRouter.patch("/:id", async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.bomItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "item not found" });
  if (!(await canOwnBomType(req.authUser!, existing.bomType as BomType))) {
    return res.status(403).json({ error: `Hanya role dengan akses ke ${existing.bomType} atau super admin yang bisa mengubah item ini` });
  }
  if (existing.status !== "SUBMITTED") {
    return res.status(400).json({ error: "Item yang sudah di-review/diproses tidak bisa diedit — ajukan item baru" });
  }

  const { name, quantity, unit, price, notes } = req.body as {
    name?: string; quantity?: number; unit?: string; price?: number; notes?: string;
  };
  if (quantity !== undefined && quantity <= 0) return res.status(400).json({ error: "quantity must be positive" });
  if (price !== undefined && price < 0) return res.status(400).json({ error: "price must not be negative" });

  const item = await prisma.bomItem.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      ...(unit !== undefined ? { unit: unit.trim() } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
    include: bomItemInclude,
  });
  logActivityFor(req, {
    action: "bomItem.update",
    entityType: "BomItem",
    entityId: item.id,
    description: `Mengubah item ${item.bomType} "${item.name}" (project "${item.project.name}")`,
  });
  res.json(serializeBomItem(item));
});

bomRouter.patch("/:id/review", async (req: AuthedRequest, res: Response) => {
  if (!(await canReviewBom(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Project Manager atau Operational Manager yang bisa me-review item BOM" });
  }
  const { decision, approveNote } = req.body as { decision?: "APPROVED" | "REJECTED"; approveNote?: string };
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
  }

  const existing = await prisma.bomItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "item not found" });
  if (existing.status !== "SUBMITTED") return res.status(400).json({ error: "item sudah di-review" });

  const item = await prisma.bomItem.update({
    where: { id: req.params.id },
    data: {
      status: decision,
      approvedByUserId: req.authUser!.id,
      approvedAt: new Date(),
      approveNote: approveNote ?? "",
    },
    include: bomItemInclude,
  });
  logActivityFor(req, {
    action: "bomItem.review",
    entityType: "BomItem",
    entityId: item.id,
    description: `${decision === "APPROVED" ? "Menyetujui" : "Menolak"} item ${item.bomType} "${item.name}" (project "${item.project.name}")`,
  });
  // DEC-063: notify the submitter + purchasing (if approved) or just
  // the submitter (if rejected) about the decision.
  await notifyBomEvent(
    req.authUser!.id,
    {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      projectId: item.projectId,
      submittedByUserId: item.submittedByUserId,
    },
    decision === "APPROVED" ? "approved" : "rejected"
  );
  res.json(serializeBomItem(item));
});

bomRouter.patch("/:id/purchasing", async (req: AuthedRequest, res: Response) => {
  if (!(await canProcessBom(req.authUser!))) {
    return res.status(403).json({ error: "Hanya tim Purchasing atau super admin yang bisa memproses item BOM" });
  }
  const { status, purchaseNote } = req.body as { status?: "PROCESSING" | "ARRIVED"; purchaseNote?: string };
  if (status !== "PROCESSING" && status !== "ARRIVED") {
    return res.status(400).json({ error: "status must be PROCESSING or ARRIVED" });
  }

  const existing = await prisma.bomItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "item not found" });
  if (existing.status !== "APPROVED" && existing.status !== "PROCESSING") {
    return res.status(400).json({ error: "item belum di-approve oleh Project Manager" });
  }

  const item = await prisma.bomItem.update({
    where: { id: req.params.id },
    data: {
      status,
      purchaseNote: purchaseNote ?? existing.purchaseNote,
      processedByUserId: req.authUser!.id,
      purchasingUpdatedAt: new Date(),
    },
    include: bomItemInclude,
  });
  logActivityFor(req, {
    action: "bomItem.purchasingUpdate",
    entityType: "BomItem",
    entityId: item.id,
    description: `Memperbarui status pembelian item ${item.bomType} "${item.name}" (project "${item.project.name}") menjadi ${status === "ARRIVED" ? "Sudah Sampai" : "Diproses"}`,
  });
  // DEC-063: notify the submitter + project PIC + PM/OM about the
  // purchasing status move (PROCESSING or ARRIVED).
  await notifyBomEvent(
    req.authUser!.id,
    {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      projectId: item.projectId,
      submittedByUserId: item.submittedByUserId,
    },
    status === "ARRIVED" ? "arrived" : "processing"
  );
  res.json(serializeBomItem(item));
});

bomRouter.delete("/:id", async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.bomItem.findUnique({ where: { id: req.params.id }, include: bomItemInclude });
  if (!existing) return res.status(404).json({ error: "item not found" });
  const isOwner = await canOwnBomType(req.authUser!, existing.bomType as BomType);
  if (!isOwner) {
    return res.status(403).json({ error: `Hanya role dengan akses ke ${existing.bomType} atau super admin yang bisa menghapus item ini` });
  }
  if (existing.status !== "SUBMITTED" && !(await isPrivileged(req.authUser!))) {
    return res.status(400).json({ error: "Item yang sudah di-review/diproses tidak bisa dihapus" });
  }

  await prisma.bomItem.delete({ where: { id: req.params.id } });
  logActivityFor(req, {
    action: "bomItem.delete",
    entityType: "BomItem",
    entityId: req.params.id,
    description: `Menghapus item ${existing.bomType} "${existing.name}" (project "${existing.project.name}")`,
  });
  res.status(204).end();
});

// Dashboard BOM summary (DEC-062). Returns totals per BOM type scoped
// by the caller's role:
//   - PM / OM / Director / super admin: see ALL three BOM types across
//     every project (so they can track the full program spend)
//   - Engineer (Mechanical / Electrical / Software Dev): only their
//     own BOM type
//   - Everyone else in the BOM viewer set: sees zero totals (no
//     dashboard card) — same "engineering team" gate the rest of the
//     BOM uses
// Status filter: only APPROVED / PROCESSING / ARRIVED items count
// toward "committed spend". SUBMITTED + REJECTED items are not yet
// budget.
bomRouter.get("/summary", requireBomViewer, async (req: AuthedRequest, res: Response) => {
  const user = req.authUser!;
  const isPrivileged = user.isSuperAdmin ||
    (await userHasAnyRoleTitle(user.id, ["Project Manager", "Operational Manager", "Director"]));
  // Engineer types only see their own type. Resolve the user's role
  // titles via getUserRoles (authUser only carries id/isSuperAdmin/name).
  const userRoles = isPrivileged ? [] : await getUserRoles(user.id);
  const userRoleTitles = userRoles.map((r) => r.title);
  const engineerTypes = BOM_TYPES.filter((bt) => {
    if (isPrivileged) return false; // privileged sees all
    return userRoleTitles.includes(DEFAULT_BOM_OWNER_ROLE[bt]);
  });
  const typesToShow: BomType[] = isPrivileged
    ? [...BOM_TYPES]
    : engineerTypes.length > 0
      ? engineerTypes
      : []; // not an engineer nor privileged — no dashboard card
  if (typesToShow.length === 0) {
    res.json({ byType: [], grandTotal: 0, scope: "none" });
    return;
  }
  const items = await prisma.bomItem.findMany({
    where: {
      bomType: { in: typesToShow },
      status: { in: ["APPROVED", "PROCESSING", "ARRIVED"] },
    },
    select: { bomType: true, quantity: true, price: true },
  });
  const totals = new Map<BomType, number>(typesToShow.map((t) => [t, 0]));
  for (const it of items) {
    const t = it.bomType as BomType;
    if (it.price == null) continue;
    totals.set(t, (totals.get(t) ?? 0) + it.price * it.quantity);
  }
  const grandTotal = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  res.json({
    scope: isPrivileged ? "all" : "engineer",
    byType: typesToShow.map((t) => ({ bomType: t, total: totals.get(t) ?? 0 })),
    grandTotal,
  });
});
