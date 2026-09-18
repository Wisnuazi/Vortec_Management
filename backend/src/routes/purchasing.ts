import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, userHasAnyRoleTitle, userHasRoleTitle, isPrivileged, type AuthedRequest } from "../auth";

export const purchasingRouter = Router();
purchasingRouter.use(requireAuth);

// DEC-062 narrows the Purchasing menu to super admin + Purchasing only.
// The old broader viewer set (OM, PM, OL, Director) is gone — those
// roles still see the per-project material requests inline in the
// project page, but the top-level Purchasing menu is now strictly the
// purchasing team's workspace.
export async function requirePurchasingViewer(req: AuthedRequest, res: Response, next: () => void) {
  if (req.authUser!.isSuperAdmin) return next();
  if (await userHasRoleTitle(req.authUser!.id, "Purchasing")) return next();
  res.status(403).json({ error: "Halaman ini khusus untuk tim Purchasing" });
}

export async function requirePurchasingEditor(req: AuthedRequest, res: Response, next: () => void) {
  if (req.authUser!.isSuperAdmin) return next();
  if (await userHasRoleTitle(req.authUser!.id, "Purchasing")) return next();
  res.status(403).json({ error: "Hanya tim Purchasing atau super admin yang bisa mengubah data ini" });
}

const attachmentInclude = {
  orderBy: { createdAt: "asc" as const },
  include: { uploadedByUser: { select: { id: true, name: true } } },
};

type ApiAttachmentRow = {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
  createdAt: Date;
  uploadedByUser: { id: string; name: string };
};

function serializeAttachment(a: ApiAttachmentRow) {
  return {
    id: a.id,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    dataUrl: a.dataUrl,
    url: a.url,
    createdAt: a.createdAt,
    uploadedByUserId: a.uploadedByUser.id,
    uploadedByUserName: a.uploadedByUser.name,
  };
}

// Requests that have cleared Project Manager review — this is the
// Purchasing team's actual queue ("list barang yang di-request dan
// di-approve oleh project manager untuk di belikan").
purchasingRouter.get("/material-requests", requirePurchasingViewer, async (_req: AuthedRequest, res: Response) => {
  const requests = await prisma.materialRequest.findMany({
    where: { status: { in: ["APPROVED", "PROCESSING", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      project: { select: { id: true, name: true } },
      requestedByUser: { select: { id: true, name: true } },
      reviewedByUser: { select: { id: true, name: true } },
      processedByUser: { select: { id: true, name: true } },
      attachments: attachmentInclude,
    },
  });
  res.json(
    requests.map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note,
      status: r.status,
      items: r.items.map((i) => ({ id: i.id, materialName: i.materialName, quantity: i.quantity, unit: i.unit, notes: i.notes })),
      projectId: r.project.id,
      projectName: r.project.name,
      requestedByUserName: r.requestedByUser.name,
      reviewedByUserName: r.reviewedByUser?.name ?? null,
      reviewNote: r.reviewNote,
      processedByUserName: r.processedByUser?.name ?? null,
      purchaseNote: r.purchaseNote,
      createdAt: r.createdAt,
      attachments: r.attachments.map(serializeAttachment),
    }))
  );
});

// DEC-062: Approved BOM items become part of the Purchasing queue.
// Once PM or OM approves a BOM item, it shows up here so Purchasing
// can process it. Status flow: APPROVED → PROCESSING (Purchasing
// starts) → ARRIVED (Purchasing marks delivered). The status syncs
// back to the BOM view for everyone (read-only for non-Purchasing).
purchasingRouter.get("/approved-bom", requirePurchasingViewer, async (_req: AuthedRequest, res: Response) => {
  const items = await prisma.bomItem.findMany({
    where: { status: { in: ["APPROVED", "PROCESSING", "ARRIVED"] } },
    orderBy: { approvedAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      submittedByUser: { select: { id: true, name: true } },
      approvedByUser: { select: { id: true, name: true } },
      processedByUser: { select: { id: true, name: true } },
    },
  });
  res.json(
    items.map((i) => ({
      id: i.id,
      projectId: i.project.id,
      projectName: i.project.name,
      bomType: i.bomType,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      notes: i.notes,
      status: i.status,
      submittedByUserName: i.submittedByUser.name,
      approvedByUserName: i.approvedByUser?.name ?? null,
      approvedAt: i.approvedAt,
      approveNote: i.approveNote,
      processedByUserName: i.processedByUser?.name ?? null,
      purchasingUpdatedAt: i.purchasingUpdatedAt,
      purchaseNote: i.purchaseNote,
    }))
  );
});

// Tasks assigned to the "Purchasing" role, across every project — connects
// this menu to the team's actual task list ("terhubung dengan task tim
// purchasing").
purchasingRouter.get("/tasks", requirePurchasingViewer, async (_req: AuthedRequest, res: Response) => {
  const tasks = await prisma.task.findMany({
    where: { taskRoles: { some: { role: { title: "Purchasing" } } } },
    orderBy: { order: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      approvedByUser: { select: { id: true, name: true } },
      attachments: attachmentInclude,
    },
  });
  res.json(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      requiresApproval: t.requiresApproval,
      approvedByUserName: t.approvedByUser?.name ?? null,
      approvedAt: t.approvedAt,
      startDate: t.startDate,
      dueDate: t.dueDate,
      projectId: t.project.id,
      projectName: t.project.name,
      attachments: t.attachments.map(serializeAttachment),
    }))
  );
});
