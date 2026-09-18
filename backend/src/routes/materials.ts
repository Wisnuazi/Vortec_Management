import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireInventoryManager, requireNotProjectManager, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";
import { buildXlsx, safeFilename, type XlsxColumn } from "../lib/exports";

export const materialsRouter = Router();
materialsRouter.use(requireAuth);
// Project Manager is blocked from the Inventory menu (DEC-061).
materialsRouter.use(requireNotProjectManager);

const materialInclude = { movements: { orderBy: { createdAt: "desc" as const } } };

function serializeMaterial(material: {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  notes: string;
  movements: { id: string; type: "IN" | "OUT"; quantity: number; note: string; createdAt: Date }[];
}) {
  const totalIn = material.movements.filter((m) => m.type === "IN").reduce((sum, m) => sum + m.quantity, 0);
  const totalOut = material.movements.filter((m) => m.type === "OUT").reduce((sum, m) => sum + m.quantity, 0);
  return {
    id: material.id,
    code: material.code,
    name: material.name,
    unit: material.unit,
    notes: material.notes,
    totalIn,
    totalOut,
    stock: totalIn - totalOut,
    movements: material.movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      note: m.note,
      createdAt: m.createdAt,
    })),
  };
}

materialsRouter.get("/", async (_req: AuthedRequest, res: Response) => {
  const materials = await prisma.material.findMany({ include: materialInclude, orderBy: { createdAt: "asc" } });
  res.json(materials.map(serializeMaterial));
});

materialsRouter.post("/", requireInventoryManager, async (req: AuthedRequest, res: Response) => {
  const { code, name, unit, notes } = req.body as {
    code?: string | null;
    name?: string;
    unit?: string;
    notes?: string;
  };
  const trimmedName = name?.trim();
  const trimmedUnit = unit?.trim();
  if (!trimmedName || !trimmedUnit) {
    return res.status(400).json({ error: "name and unit are required" });
  }
  const trimmedCode = code?.trim() || null;

  // Dedupe by code OR name (case-insensitive trim). If a match is
  // found, return 409 with the existing row attached so the client
  // can prompt the user "barang sudah ada, tambahkan jumlah?" — on
  // confirm, the client POSTs a stock-IN movement for the existing
  // material (since stock is computed, not stored). See DEC-061.
  const existing = await prisma.material.findFirst({
    where: trimmedCode
      ? { OR: [{ code: trimmedCode }, { name: { equals: trimmedName, mode: "insensitive" } }] }
      : { name: { equals: trimmedName, mode: "insensitive" } },
    include: materialInclude,
  });
  if (existing) {
    return res.status(409).json({
      error: "MATERIAL_ALREADY_EXISTS",
      message: trimmedCode
        ? `Bahan baku dengan kode "${trimmedCode}" atau nama "${trimmedName}" sudah ada`
        : `Bahan baku dengan nama "${trimmedName}" sudah ada`,
      existing: serializeMaterial(existing),
    });
  }

  const material = await prisma.material.create({
    data: { code: trimmedCode, name: trimmedName, unit: trimmedUnit, notes: notes ?? "" },
    include: materialInclude,
  });
  logActivityFor(req, {
    action: "material.create",
    entityType: "Material",
    entityId: material.id,
    description: `Menambahkan bahan baku "${material.name}"`,
  });
  res.status(201).json(serializeMaterial(material));
});

// Confirm-flow for the dedupe prompt (DEC-061). The client receives a
// 409 with `existing` from POST / above, shows the prompt, and on user
// confirmation calls this endpoint with the existing material's id
// and the quantity to add. Records a stock-IN movement so the computed
// stock goes up by `quantity`, and logs the action.
materialsRouter.post("/:id/confirm-duplicate", requireInventoryManager, async (req: AuthedRequest, res: Response) => {
  const { quantity, note } = req.body as { quantity?: number; note?: string };
  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ error: "quantity must be greater than 0" });
  }
  try {
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: { movements: { create: { type: "IN", quantity: qty, note: note ?? "Penggabungan bahan baku duplikat" } } },
      include: materialInclude,
    });
    logActivityFor(req, {
      action: "material.mergeDuplicate",
      entityType: "Material",
      entityId: material.id,
      description: `Menggabungkan bahan baku duplikat: tambah ${qty} ${material.unit} "${material.name}"`,
    });
    res.status(201).json(serializeMaterial(material));
  } catch {
    res.status(404).json({ error: "material not found" });
  }
});

materialsRouter.patch("/:id", requireInventoryManager, async (req: AuthedRequest, res: Response) => {
  const { code, name, unit, notes } = req.body as {
    code?: string | null;
    name?: string;
    unit?: string;
    notes?: string;
  };

  if (code !== undefined && code) {
    const trimmedCode = code.trim();
    const existing = await prisma.material.findUnique({ where: { code: trimmedCode } });
    if (existing && existing.id !== req.params.id) {
      return res.status(409).json({ error: "material code already in use" });
    }
  }

  try {
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: {
        ...(code !== undefined ? { code: code?.trim() || null } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(unit !== undefined ? { unit: unit.trim() } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: materialInclude,
    });
    logActivityFor(req, {
      action: "material.update",
      entityType: "Material",
      entityId: material.id,
      description: `Mengubah bahan baku "${material.name}"`,
    });
    res.json(serializeMaterial(material));
  } catch {
    res.status(404).json({ error: "material not found" });
  }
});

materialsRouter.delete("/:id", requireInventoryManager, async (req: AuthedRequest, res: Response) => {
  try {
    const material = await prisma.material.findUnique({ where: { id: req.params.id } });
    await prisma.material.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "material.delete",
      entityType: "Material",
      entityId: req.params.id,
      description: `Menghapus bahan baku "${material?.name ?? req.params.id}"`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "material not found" });
  }
});

materialsRouter.post("/:id/movements", requireInventoryManager, async (req: AuthedRequest, res: Response) => {
  const { type, quantity, note } = req.body as { type?: string; quantity?: number; note?: string };
  if (type !== "IN" && type !== "OUT") {
    return res.status(400).json({ error: "type must be IN or OUT" });
  }
  if (!quantity || quantity <= 0) {
    return res.status(400).json({ error: "quantity must be greater than 0" });
  }

  // Barang harus masuk gudang dulu sebelum bisa keluar — stok tidak boleh minus.
  if (type === "OUT") {
    const existing = await prisma.material.findUnique({ where: { id: req.params.id }, include: materialInclude });
    if (!existing) return res.status(404).json({ error: "material not found" });
    const currentStock = serializeMaterial(existing).stock;
    if (quantity > currentStock) {
      return res.status(400).json({
        error: `Stok tidak mencukupi. Sisa stok saat ini: ${currentStock} ${existing.unit}. Barang harus masuk gudang dulu sebelum bisa keluar.`,
      });
    }
  }

  try {
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: { movements: { create: { type, quantity, note: note ?? "" } } },
      include: materialInclude,
    });
    logActivityFor(req, {
      action: type === "IN" ? "material.stockIn" : "material.stockOut",
      entityType: "Material",
      entityId: material.id,
      description: `${type === "IN" ? "Barang masuk" : "Barang keluar"}: ${quantity} ${material.unit} "${material.name}"`,
    });
    res.status(201).json(serializeMaterial(material));
  } catch {
    res.status(404).json({ error: "material not found" });
  }
});

materialsRouter.delete(
  "/:materialId/movements/:movementId",
  requireInventoryManager,
  async (req: AuthedRequest, res: Response) => {
    try {
      await prisma.stockMovement.delete({ where: { id: req.params.movementId } });
      const material = await prisma.material.findUniqueOrThrow({
        where: { id: req.params.materialId },
        include: materialInclude,
      });
      res.json(serializeMaterial(material));
    } catch {
      res.status(404).json({ error: "movement or material not found" });
    }
  }
);

// Material xlsx export (DEC-061). Mirrors the on-screen inventory list
// (every material the user is allowed to see — read-only, no role
// scoping beyond the PM block at the top of this file). Computes the
// current stock from movements for the "Stok" column so the file is a
// self-contained snapshot.
materialsRouter.get("/export", async (req: AuthedRequest, res: Response) => {
  const materials = await prisma.material.findMany({ include: materialInclude, orderBy: { name: "asc" } });
  const rows = materials.map((m) => {
    const s = serializeMaterial(m);
    return {
      code: m.code,
      name: m.name,
      unit: m.unit,
      stock: s.stock,
      totalIn: s.totalIn,
      totalOut: s.totalOut,
      notes: m.notes,
    };
  });
  const columns: XlsxColumn<(typeof rows)[number]>[] = [
    { header: "Kode Barang", value: (r) => r.code, width: 18 },
    { header: "Nama Bahan", value: (r) => r.name, width: 32 },
    { header: "Satuan", value: (r) => r.unit, width: 12 },
    { header: "Stok Saat Ini", value: (r) => r.stock, width: 16 },
    { header: "Total Masuk", value: (r) => r.totalIn, width: 14 },
    { header: "Total Keluar", value: (r) => r.totalOut, width: 14 },
    { header: "Catatan", value: (r) => r.notes, width: 28 },
  ];
  const buffer = await buildXlsx(rows, columns);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename("Daftar Inventaris Vortec")}.xlsx"`);
  res.send(buffer);
});
