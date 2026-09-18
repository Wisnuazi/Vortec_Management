import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, isPrivileged, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";
import { prepareDiskPath, writeDiskFile, deleteDiskFile, type AttachmentSubfolder } from "../lib/diskStorage";

export const workflowsRouter = Router();
workflowsRouter.use(requireAuth);

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

async function requireOmOrSuperAdmin(req: AuthedRequest, res: Response, next: () => void) {
  // DEC-066: Workflow library is curated by OM + super admin. Other roles
  // can read via GET (no gate) but can't POST/PATCH/DELETE.
  if (await isPrivileged(req.authUser!)) return next();
  res.status(403).json({ error: "Hanya Operational Manager dan super admin yang bisa mengubah Workflow" });
}

type WorkflowRow = Awaited<ReturnType<typeof loadWorkflows>>[number];

async function loadWorkflows() {
  return prisma.workflow.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "desc" }],
    include: {
      createdByUser: { select: { id: true, name: true } },
      updatedByUser: { select: { id: true, name: true } },
      attachments: {
        orderBy: { createdAt: "asc" },
        include: { uploadedByUser: { select: { id: true, name: true } } },
      },
    },
  });
}

function serializeWorkflow(w: WorkflowRow) {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    steps: w.steps,
    category: w.category,
    order: w.order,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    createdByUserId: w.createdByUserId,
    createdByUserName: w.createdByUser.name,
    updatedByUserId: w.updatedByUserId,
    updatedByUserName: w.updatedByUser?.name ?? null,
    attachments: w.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      diskPath: a.diskPath,
      url: a.url,
      createdAt: a.createdAt,
      uploadedByUserId: a.uploadedByUserId,
      uploadedByUserName: a.uploadedByUser.name,
    })),
  };
}

function isValidUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

workflowsRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const items = await loadWorkflows();
  res.json(items.map(serializeWorkflow));
});

workflowsRouter.post("/", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const { name, description, steps, category, order } = req.body as {
    name?: string;
    description?: string;
    steps?: string;
    category?: string;
    order?: number;
  };
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "Nama workflow wajib diisi." });
  const orderNum = typeof order === "number" && Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : 0;

  const created = await prisma.workflow.create({
    data: {
      name: trimmed,
      description: description ?? "",
      steps: steps ?? "",
      category: category ?? "",
      order: orderNum,
      createdByUserId: req.authUser!.id,
    },
    include: {
      createdByUser: { select: { id: true, name: true } },
      attachments: { include: { uploadedByUser: { select: { id: true, name: true } } } },
    },
  });
  logActivityFor(req, {
    action: "workflow.create",
    entityType: "Workflow",
    entityId: created.id,
    description: `Membuat workflow "${created.name}"`,
  });
  res.status(201).json(serializeWorkflow(created as WorkflowRow));
});

workflowsRouter.patch("/:id", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "workflow not found" });

  const { name, description, steps, category, order } = req.body as {
    name?: string;
    description?: string;
    steps?: string;
    category?: string;
    order?: number;
  };

  try {
    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(steps !== undefined ? { steps } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(order !== undefined && typeof order === "number" ? { order: Math.max(0, Math.trunc(order)) } : {}),
        updatedByUserId: req.authUser!.id,
      },
      include: {
        createdByUser: { select: { id: true, name: true } },
        updatedByUser: { select: { id: true, name: true } },
        attachments: { include: { uploadedByUser: { select: { id: true, name: true } } } },
      },
    });
    logActivityFor(req, {
      action: "workflow.update",
      entityType: "Workflow",
      entityId: updated.id,
      description: `Memperbarui workflow "${updated.name}"`,
    });
    res.json(serializeWorkflow(updated as WorkflowRow));
  } catch {
    res.status(404).json({ error: "workflow not found" });
  }
});

workflowsRouter.delete("/:id", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.workflow.findUnique({
    where: { id: req.params.id },
    include: { attachments: { select: { diskPath: true } } },
  });
  if (!existing) return res.status(404).json({ error: "workflow not found" });

  try {
    // Cascade-delete will remove attachment rows; we also drop the disk
    // files to avoid orphans in /data/attachments/workflows/.
    for (const a of existing.attachments) {
      if (a.diskPath) {
        try {
          await deleteDiskFile(a.diskPath);
        } catch {
          // best-effort
        }
      }
    }
    await prisma.workflow.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "workflow.delete",
      entityType: "Workflow",
      entityId: req.params.id,
      description: `Menghapus workflow "${existing.name}"`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "workflow not found" });
  }
});

// POST /:id/attachments/upload — file upload (multipart/form-data).
// Mirrors the per-project attachment upload pattern in projects.ts.
// Field name: "file".
workflowsRouter.post("/:id/attachments/upload", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "workflow not found" });

  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) {
      res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" });
      return;
    }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "Tidak ada file yang diunggah." });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({ error: `File melebihi batas ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` });
      return;
    }

    const subfolder: AttachmentSubfolder = "workflows";
    const { diskPath } = await prepareDiskPath(subfolder, file.originalname);
    await writeDiskFile(diskPath, file.buffer);

    const created = await prisma.attachment.create({
      data: {
        kind: "FILE",
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        diskPath,
        dataUrl: null,
        url: null,
        uploadedByUserId: req.authUser!.id,
        workflowId: req.params.id,
      },
      include: { uploadedByUser: { select: { id: true, name: true } } },
    });
    logActivityFor(req, {
      action: "workflow.attachment.upload",
      entityType: "Workflow",
      entityId: req.params.id,
      description: `Mengunggah lampiran workflow "${existing.name}"`,
    });
    res.status(201).json({
      id: created.id,
      kind: created.kind,
      fileName: created.fileName,
      mimeType: created.mimeType,
      fileSize: created.fileSize,
      diskPath: created.diskPath,
      url: created.url,
      createdAt: created.createdAt,
      uploadedByUserId: created.uploadedByUserId,
      uploadedByUserName: created.uploadedByUser.name,
    });
  });
});

// POST /:id/attachments — link attachment (LINK kind).
workflowsRouter.post("/:id/attachments", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.workflow.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "workflow not found" });

  const { fileName, url } = req.body as { fileName?: string; url?: string };
  const trimmedName = fileName?.trim();
  if (!trimmedName || !isValidUrl(url)) {
    return res.status(400).json({ error: "fileName + URL https/http wajib diisi." });
  }

  const created = await prisma.attachment.create({
    data: {
      kind: "LINK",
      fileName: trimmedName,
      url,
      uploadedByUserId: req.authUser!.id,
      workflowId: req.params.id,
    },
    include: { uploadedByUser: { select: { id: true, name: true } } },
  });
  logActivityFor(req, {
    action: "workflow.attachment.link",
    entityType: "Workflow",
    entityId: req.params.id,
    description: `Menambah lampiran link ke workflow "${existing.name}"`,
  });
  res.status(201).json({
    id: created.id,
    kind: created.kind,
    fileName: created.fileName,
    url: created.url,
    createdAt: created.createdAt,
    uploadedByUserId: created.uploadedByUserId,
    uploadedByUserName: created.uploadedByUser.name,
  });
});

workflowsRouter.delete("/:id/attachments/:attachmentId", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.workflowId !== req.params.id) {
    return res.status(404).json({ error: "attachment not found" });
  }
  if (attachment.diskPath) {
    try {
      await deleteDiskFile(attachment.diskPath);
    } catch {
      // best-effort
    }
  }
  await prisma.attachment.delete({ where: { id: req.params.attachmentId } });
  res.status(204).end();
});
