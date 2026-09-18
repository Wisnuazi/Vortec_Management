import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, isPrivileged, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";
import { prepareDiskPath, writeDiskFile, deleteDiskFile, type AttachmentSubfolder } from "../lib/diskStorage";

export const sopsRouter = Router();
sopsRouter.use(requireAuth);

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

async function requireOmOrSuperAdmin(req: AuthedRequest, res: Response, next: () => void) {
  if (await isPrivileged(req.authUser!)) return next();
  res.status(403).json({ error: "Hanya Operational Manager dan super admin yang bisa mengubah SOP" });
}

type SopRow = Awaited<ReturnType<typeof loadSops>>[number];

async function loadSops() {
  return prisma.sOP.findMany({
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

function serializeSop(s: SopRow) {
  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    content: s.content,
    category: s.category,
    order: s.order,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    createdByUserId: s.createdByUserId,
    createdByUserName: s.createdByUser.name,
    updatedByUserId: s.updatedByUserId,
    updatedByUserName: s.updatedByUser?.name ?? null,
    attachments: s.attachments.map((a) => ({
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

sopsRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const items = await loadSops();
  res.json(items.map(serializeSop));
});

sopsRouter.post("/", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const { title, summary, content, category, order } = req.body as {
    title?: string;
    summary?: string;
    content?: string;
    category?: string;
    order?: number;
  };
  const trimmed = title?.trim();
  if (!trimmed) return res.status(400).json({ error: "Judul SOP wajib diisi." });
  const orderNum = typeof order === "number" && Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : 0;

  const created = await prisma.sOP.create({
    data: {
      title: trimmed,
      summary: summary ?? "",
      content: content ?? "",
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
    action: "sop.create",
    entityType: "SOP",
    entityId: created.id,
    description: `Membuat SOP "${created.title}"`,
  });
  res.status(201).json(serializeSop(created as SopRow));
});

sopsRouter.patch("/:id", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.sOP.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "sop not found" });

  const { title, summary, content, category, order } = req.body as {
    title?: string;
    summary?: string;
    content?: string;
    category?: string;
    order?: number;
  };

  try {
    const updated = await prisma.sOP.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(content !== undefined ? { content } : {}),
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
      action: "sop.update",
      entityType: "SOP",
      entityId: updated.id,
      description: `Memperbarui SOP "${updated.title}"`,
    });
    res.json(serializeSop(updated as SopRow));
  } catch {
    res.status(404).json({ error: "sop not found" });
  }
});

sopsRouter.delete("/:id", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.sOP.findUnique({
    where: { id: req.params.id },
    include: { attachments: { select: { diskPath: true } } },
  });
  if (!existing) return res.status(404).json({ error: "sop not found" });

  try {
    for (const a of existing.attachments) {
      if (a.diskPath) {
        try {
          await deleteDiskFile(a.diskPath);
        } catch {
          // best-effort
        }
      }
    }
    await prisma.sOP.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "sop.delete",
      entityType: "SOP",
      entityId: req.params.id,
      description: `Menghapus SOP "${existing.title}"`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "sop not found" });
  }
});

sopsRouter.post("/:id/attachments/upload", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.sOP.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "sop not found" });

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

    const subfolder: AttachmentSubfolder = "sops";
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
        sopId: req.params.id,
      },
      include: { uploadedByUser: { select: { id: true, name: true } } },
    });
    logActivityFor(req, {
      action: "sop.attachment.upload",
      entityType: "SOP",
      entityId: req.params.id,
      description: `Mengunggah lampiran SOP "${existing.title}"`,
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

sopsRouter.post("/:id/attachments", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.sOP.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "sop not found" });

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
      sopId: req.params.id,
    },
    include: { uploadedByUser: { select: { id: true, name: true } } },
  });
  logActivityFor(req, {
    action: "sop.attachment.link",
    entityType: "SOP",
    entityId: req.params.id,
    description: `Menambah lampiran link ke SOP "${existing.title}"`,
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

sopsRouter.delete("/:id/attachments/:attachmentId", requireOmOrSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment || attachment.sopId !== req.params.id) {
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
