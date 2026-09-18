import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, type AuthedRequest } from "../auth";
import { requirePurchasingViewer, requirePurchasingEditor } from "./purchasing";
import { logActivityFor } from "../activityLog";
import { buildXlsx, safeFilename, type XlsxColumn } from "../lib/exports";

export const vendorsRouter = Router();
vendorsRouter.use(requireAuth);

const VENDOR_TYPES = ["COMPANY", "MARKETPLACE"];

function serializeVendor(v: {
  id: string;
  name: string;
  type: string;
  link: string | null;
  contact: string | null;
  notes: string;
}) {
  return { id: v.id, name: v.name, type: v.type, link: v.link, contact: v.contact, notes: v.notes };
}

vendorsRouter.get("/", requirePurchasingViewer, async (_req: AuthedRequest, res: Response) => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  res.json(vendors.map(serializeVendor));
});

vendorsRouter.post("/", requirePurchasingEditor, async (req: AuthedRequest, res: Response) => {
  const { name, type, link, contact, notes } = req.body as {
    name?: string;
    type?: string;
    link?: string | null;
    contact?: string | null;
    notes?: string;
  };
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });
  if (type !== undefined && !VENDOR_TYPES.includes(type)) return res.status(400).json({ error: "invalid type" });

  const vendor = await prisma.vendor.create({
    data: {
      name: trimmed,
      type: (type as "COMPANY" | "MARKETPLACE") ?? "COMPANY",
      link: link?.trim() || null,
      contact: contact?.trim() || null,
      notes: notes ?? "",
    },
  });
  logActivityFor(req, {
    action: "vendor.create",
    entityType: "Vendor",
    entityId: vendor.id,
    description: `Menambahkan vendor "${vendor.name}"`,
  });
  res.status(201).json(serializeVendor(vendor));
});

vendorsRouter.patch("/:id", requirePurchasingEditor, async (req: AuthedRequest, res: Response) => {
  const { name, type, link, contact, notes } = req.body as {
    name?: string;
    type?: string;
    link?: string | null;
    contact?: string | null;
    notes?: string;
  };
  if (type !== undefined && !VENDOR_TYPES.includes(type)) return res.status(400).json({ error: "invalid type" });

  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(type !== undefined ? { type: type as "COMPANY" | "MARKETPLACE" } : {}),
        ...(link !== undefined ? { link: link?.trim() || null } : {}),
        ...(contact !== undefined ? { contact: contact?.trim() || null } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    logActivityFor(req, {
      action: "vendor.update",
      entityType: "Vendor",
      entityId: vendor.id,
      description: `Mengubah vendor "${vendor.name}"`,
    });
    res.json(serializeVendor(vendor));
  } catch {
    res.status(404).json({ error: "vendor not found" });
  }
});

vendorsRouter.delete("/:id", requirePurchasingEditor, async (req: AuthedRequest, res: Response) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    await prisma.vendor.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "vendor.delete",
      entityType: "Vendor",
      entityId: req.params.id,
      description: `Menghapus vendor "${vendor?.name ?? req.params.id}"`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "vendor not found" });
  }
});

// xlsx export (DEC-062). The dedicated Vendor page calls this for
// the "Download" button.
vendorsRouter.get("/export", requirePurchasingViewer, async (_req: AuthedRequest, res: Response) => {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  const rows = vendors.map((v) => ({
    type: v.type,
    name: v.name,
    link: v.link,
    contact: v.contact,
    notes: v.notes,
  }));
  const columns: XlsxColumn<(typeof rows)[number]>[] = [
    { header: "Tipe", value: (r) => r.type, width: 14 },
    { header: "Nama Vendor", value: (r) => r.name, width: 32 },
    { header: "Link", value: (r) => r.link, width: 30 },
    { header: "Kontak", value: (r) => r.contact, width: 24 },
    { header: "Catatan", value: (r) => r.notes, width: 28 },
  ];
  const buffer = await buildXlsx(rows, columns);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename("Daftar Vendor Vortec")}.xlsx"`);
  res.send(buffer);
});
