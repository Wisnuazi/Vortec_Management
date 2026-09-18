import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireNotProjectManager, requirePrivileged, requireCanEditFloorLayout, userHasAnyRoleTitle, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";
import { buildXlsx, safeFilename, type XlsxColumn } from "../lib/exports";

export const floorsRouter = Router();
floorsRouter.use(requireAuth);
// Project Manager is blocked from both the Asset and Inventory menus
// (DEC-061). Applied at the router level so every floor/asset endpoint
// — read and write — rejects PM with the same message; the sidebar
// hides the link client-side, and this is the server-side enforcement.
floorsRouter.use(requireNotProjectManager);

// Operational Manager/Operational Leader/Director (or super admin) manage
// every floor's assets unrestricted — the same "full access" set as
// Kasbon (DEC-048) extended by DEC-051. Everyone else's asset-management
// scope depends on which floor-specific Assets role they hold (e.g.
// "Assets Lantai 1") — see DEC-049. The old flat "Assets" role (no
// floor attached) grants no special access under this scheme; a holder
// of only that legacy role is treated the same as any other employee
// (view-only, matching the general Organization-content read rule).
const FULL_ASSET_ACCESS_ROLE_TITLES = ["Operational Manager", "Operational Leader", "Director"];
const MAX_PHOTO_LENGTH = 2_500_000; // ~1.9MB decoded, generous for a resized asset photo

type AssetAccessScope = { full: boolean; floorIds: Set<string> };

async function userAssetFloorIds(userId: string): Promise<string[]> {
  const rows = await prisma.userRole.findMany({
    where: { userId, role: { floorId: { not: null } } },
    select: { role: { select: { floorId: true } } },
  });
  return rows.map((r) => r.role.floorId).filter((id): id is string => id !== null);
}

async function assetAccessScope(authUser: { id: string; isSuperAdmin: boolean }): Promise<AssetAccessScope> {
  if (authUser.isSuperAdmin) return { full: true, floorIds: new Set() };
  if (await userHasAnyRoleTitle(authUser.id, FULL_ASSET_ACCESS_ROLE_TITLES)) return { full: true, floorIds: new Set() };
  return { full: false, floorIds: new Set(await userAssetFloorIds(authUser.id)) };
}

// Gates asset mutation to a specific floor: super admin/OM/OL as before,
// or a caller whose floor-scoped Assets role(s) include the floor named
// by the route's :id or :floorId param. A caller with no floor-scoped
// role at all (including a holder of only the legacy flat "Assets" role)
// is rejected, same as any other non-privileged employee today.
async function requireAssetManagerForFloor(req: AuthedRequest, res: Response, next: () => void) {
  const targetFloorId = req.params.floorId ?? req.params.id;
  const scope = await assetAccessScope(req.authUser!);
  if (scope.full || (targetFloorId && scope.floorIds.has(targetFloorId))) return next();
  res.status(403).json({
    error: "Anda hanya bisa mengelola aset pada lantai yang menjadi tanggung jawab Anda (atau harus Operational Manager/Leader/super admin)",
  });
}

const floorInclude = { assets: { orderBy: { createdAt: "asc" as const } } };

function serializeFloor(floor: {
  id: string;
  label: string;
  usage: string;
  description: string;
  order: number;
  assets: {
    id: string;
    code: string | null;
    name: string;
    quantity: number;
    notes: string;
    price: number | null;
    photoUrl: string | null;
    acquiredAt: Date | null;
  }[];
}) {
  return {
    id: floor.id,
    label: floor.label,
    usage: floor.usage,
    description: floor.description,
    order: floor.order,
    assets: floor.assets.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      quantity: a.quantity,
      notes: a.notes,
      price: a.price,
      photoUrl: a.photoUrl,
      acquiredAt: a.acquiredAt ? a.acquiredAt.toISOString() : null,
    })),
  };
}

function validPhotoUrl(photoUrl: unknown): photoUrl is string {
  return typeof photoUrl === "string" && photoUrl.startsWith("data:image/") && photoUrl.length <= MAX_PHOTO_LENGTH;
}

// This same endpoint feeds both the Assets page and the Organization
// page's building-layout panel (DEC-010) — floor *structure* (label/
// usage/description) stays visible to everyone as before, since that's
// general org-chart context, not asset data. What's scoped per DEC-049
// ("akun yang terdaftar di role asset lantai 1 hanya boleh akses ke data
// asset lantai 1") is the *assets array*: a caller whose only connection
// to Assets is one or more floor-scoped roles (e.g. "Assets Lantai 1")
// gets every floor back, but with `assets: []` on any floor outside
// their scope. Super admin/OM/OL, and anyone with no floor-scoped role
// at all (including a holder of only the legacy flat "Assets" role), see
// every floor's real asset list — unchanged from before this decision.
floorsRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const scope = await assetAccessScope(req.authUser!);
  const floors = await prisma.floor.findMany({ include: floorInclude, orderBy: { order: "asc" } });
  res.json(
    floors.map((floor) => {
      const serialized = serializeFloor(floor);
      if (!scope.full && scope.floorIds.size > 0 && !scope.floorIds.has(floor.id)) {
        return { ...serialized, assets: [] };
      }
      return serialized;
    })
  );
});

// Asset xlsx export (DEC-061). Reuses the same per-floor scope as
// GET / so a floor-scoped user (e.g. "Assets Lantai 1") gets only
// their floor in the download. The columns mirror the on-screen table
// so the downloaded file is a faithful snapshot of what the user sees.
floorsRouter.get("/export", async (req: AuthedRequest, res: Response) => {
  const scope = await assetAccessScope(req.authUser!);
  const floors = await prisma.floor.findMany({ include: floorInclude, orderBy: { order: "asc" } });
  const visibleFloors = floors.filter((f) => scope.full || scope.floorIds.size === 0 || scope.floorIds.has(f.id));
  const rows = visibleFloors.flatMap((f) =>
    f.assets.map((a) => ({
      floorLabel: f.label,
      floorUsage: f.usage,
      code: a.code,
      name: a.name,
      quantity: a.quantity,
      price: a.price,
      acquiredAt: a.acquiredAt,
      notes: a.notes,
    }))
  );
  const columns: XlsxColumn<(typeof rows)[number]>[] = [
    { header: "Floor", value: (r) => r.floorLabel, width: 18 },
    { header: "Usage", value: (r) => r.floorUsage, width: 22 },
    { header: "Kode", value: (r) => r.code, width: 16 },
    { header: "Nama Aset", value: (r) => r.name, width: 32 },
    { header: "Jumlah", value: (r) => r.quantity, width: 10 },
    { header: "Harga (Rp)", value: (r) => r.price, width: 16 },
    { header: "Tanggal Perolehan", value: (r) => (r.acquiredAt ? r.acquiredAt.toISOString().slice(0, 10) : ""), width: 18 },
    { header: "Catatan", value: (r) => r.notes, width: 28 },
  ];
  const buffer = await buildXlsx(rows, columns);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename("Daftar Aset Vortec")}.xlsx"`);
  res.send(buffer);
});

// DEC-064: floor layout description (physical layout + security notes) is
// sensitive — only super admin + Director + OM can edit it. Asset CRUD
// stays on the existing per-floor-scope gate (requireAssetManagerForFloor).
floorsRouter.patch("/:id", requireCanEditFloorLayout, async (req: AuthedRequest, res: Response) => {
  const { description } = req.body as { description?: string };
  try {
    const floor = await prisma.floor.update({
      where: { id: req.params.id },
      data: { description: description ?? "" },
      include: floorInclude,
    });
    res.json(serializeFloor(floor));
  } catch {
    res.status(404).json({ error: "floor not found" });
  }
});

function parseAcquiredAt(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

floorsRouter.post("/:id/assets", requireAssetManagerForFloor, async (req: AuthedRequest, res: Response) => {
  const { code, name, quantity, notes, price, photoUrl, acquiredAt } = req.body as {
    code?: string | null;
    name?: string;
    quantity?: number;
    notes?: string;
    price?: number | null;
    photoUrl?: string | null;
    acquiredAt?: string | null;
  };
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });
  const trimmedCode = code?.trim() || null;
  if (photoUrl && !validPhotoUrl(photoUrl)) {
    return res.status(400).json({ error: "invalid or oversized asset photo" });
  }

  if (trimmedCode) {
    const existing = await prisma.asset.findUnique({ where: { code: trimmedCode } });
    if (existing) return res.status(409).json({ error: "asset code already in use" });
  }

  try {
    const floor = await prisma.floor.update({
      where: { id: req.params.id },
      data: {
        assets: {
          create: {
            code: trimmedCode,
            name: trimmed,
            quantity: quantity && quantity > 0 ? Math.floor(quantity) : 1,
            notes: notes ?? "",
            price: price && price > 0 ? price : null,
            photoUrl: photoUrl || null,
            acquiredAt: parseAcquiredAt(acquiredAt) ?? null,
          },
        },
      },
      include: floorInclude,
    });
    logActivityFor(req, {
      action: "asset.create",
      entityType: "Asset",
      description: `Menambahkan aset "${trimmed}" di ${floor.label}`,
    });
    res.status(201).json(serializeFloor(floor));
  } catch {
    res.status(404).json({ error: "floor not found" });
  }
});

floorsRouter.patch("/:floorId/assets/:assetId", requireAssetManagerForFloor, async (req: AuthedRequest, res: Response) => {
  const { code, name, quantity, notes, price, photoUrl, acquiredAt } = req.body as {
    code?: string | null;
    name?: string;
    quantity?: number;
    notes?: string;
    price?: number | null;
    photoUrl?: string | null;
    acquiredAt?: string | null;
  };

  if (code !== undefined && code) {
    const trimmedCode = code.trim();
    const existing = await prisma.asset.findUnique({ where: { code: trimmedCode } });
    if (existing && existing.id !== req.params.assetId) {
      return res.status(409).json({ error: "asset code already in use" });
    }
  }
  if (photoUrl && !validPhotoUrl(photoUrl)) {
    return res.status(400).json({ error: "invalid or oversized asset photo" });
  }

  try {
    const updated = await prisma.asset.update({
      where: { id: req.params.assetId },
      data: {
        ...(code !== undefined ? { code: code?.trim() || null } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(quantity !== undefined ? { quantity: Math.max(1, Math.floor(quantity)) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(price !== undefined ? { price: price && price > 0 ? price : null } : {}),
        ...(photoUrl !== undefined ? { photoUrl: photoUrl || null } : {}),
        ...(acquiredAt !== undefined ? { acquiredAt: parseAcquiredAt(acquiredAt) } : {}),
      },
    });
    const floor = await prisma.floor.findUniqueOrThrow({ where: { id: req.params.floorId }, include: floorInclude });
    logActivityFor(req, {
      action: "asset.update",
      entityType: "Asset",
      entityId: updated.id,
      description: `Mengubah aset "${updated.name}"`,
    });
    res.json(serializeFloor(floor));
  } catch {
    res.status(404).json({ error: "asset or floor not found" });
  }
});

floorsRouter.delete("/:floorId/assets/:assetId", requireAssetManagerForFloor, async (req: AuthedRequest, res: Response) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.assetId } });
    await prisma.asset.delete({ where: { id: req.params.assetId } });
    const floor = await prisma.floor.findUniqueOrThrow({ where: { id: req.params.floorId }, include: floorInclude });
    logActivityFor(req, {
      action: "asset.delete",
      entityType: "Asset",
      entityId: req.params.assetId,
      description: `Menghapus aset "${asset?.name ?? req.params.assetId}"`,
    });
    res.json(serializeFloor(floor));
  } catch {
    res.status(404).json({ error: "asset or floor not found" });
  }
});
