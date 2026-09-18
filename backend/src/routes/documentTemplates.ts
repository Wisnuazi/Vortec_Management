import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, isPrivileged, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";

export const documentTemplatesRouter = Router();
documentTemplatesRouter.use(requireAuth);

// Every authenticated role can view/download templates; only super admin,
// Operational Manager, or Director can CRUD the library itself — see
// DEC-034 (OM) and DEC-051 (Director oversight).
async function requireTemplateEditor(req: AuthedRequest, res: Response, next: () => void) {
  if (await isPrivileged(req.authUser!)) return next();
  res.status(403).json({ error: "Hanya Operational Manager, Director, atau super admin yang bisa mengubah template dokumen" });
}

const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024; // 8MB, same cap as project attachments

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validTemplateFileInput(body: unknown) {
  const { kind, fileName, mimeType, fileSize, dataUrl, url } = (body ?? {}) as {
    kind?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    dataUrl?: string;
    url?: string;
  };
  const trimmedName = fileName?.trim();
  if (!trimmedName) return null;

  if (kind === "LINK") {
    const trimmedUrl = url?.trim();
    if (!trimmedUrl || !isValidHttpUrl(trimmedUrl)) return null;
    return { kind: "LINK" as const, fileName: trimmedName, mimeType: "", fileSize: 0, dataUrl: null, url: trimmedUrl };
  }

  if (!mimeType?.trim() || !dataUrl?.startsWith("data:")) return null;
  if (!fileSize || fileSize <= 0 || fileSize > MAX_TEMPLATE_BYTES) return null;
  return { kind: "FILE" as const, fileName: trimmedName, mimeType: mimeType.trim(), fileSize, dataUrl, url: null };
}

function serializeTemplate(t: {
  id: string;
  name: string;
  description: string;
  kind: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
  createdByUser: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    kind: t.kind,
    fileName: t.fileName,
    mimeType: t.mimeType,
    fileSize: t.fileSize,
    dataUrl: t.dataUrl,
    url: t.url,
    createdByUserId: t.createdByUser.id,
    createdByUserName: t.createdByUser.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

documentTemplatesRouter.get("/", async (_req: AuthedRequest, res: Response) => {
  const templates = await prisma.documentTemplate.findMany({
    orderBy: { name: "asc" },
    include: { createdByUser: { select: { id: true, name: true } } },
  });
  res.json(templates.map(serializeTemplate));
});

documentTemplatesRouter.post("/", requireTemplateEditor, async (req: AuthedRequest, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  const trimmedName = name?.trim();
  if (!trimmedName) return res.status(400).json({ error: "name is required" });

  const fileInput = validTemplateFileInput(req.body);
  if (!fileInput) return res.status(400).json({ error: "File atau link tidak valid, atau file melebihi 8MB" });

  const template = await prisma.documentTemplate.create({
    data: { name: trimmedName, description: description ?? "", ...fileInput, createdByUserId: req.authUser!.id },
    include: { createdByUser: { select: { id: true, name: true } } },
  });
  logActivityFor(req, {
    action: "documentTemplate.create",
    entityType: "DocumentTemplate",
    entityId: template.id,
    description: `Menambahkan template dokumen "${template.name}"`,
  });
  res.status(201).json(serializeTemplate(template));
});

documentTemplatesRouter.patch("/:id", requireTemplateEditor, async (req: AuthedRequest, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  const replacingFile = req.body && ((req.body as { dataUrl?: unknown }).dataUrl !== undefined || (req.body as { url?: unknown }).url !== undefined);
  const fileInput = replacingFile ? validTemplateFileInput(req.body) : null;
  if (replacingFile && !fileInput) return res.status(400).json({ error: "File atau link tidak valid, atau file melebihi 8MB" });

  try {
    const template = await prisma.documentTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(fileInput ?? {}),
      },
      include: { createdByUser: { select: { id: true, name: true } } },
    });
    logActivityFor(req, {
      action: "documentTemplate.update",
      entityType: "DocumentTemplate",
      entityId: template.id,
      description: `Mengubah template dokumen "${template.name}"`,
    });
    res.json(serializeTemplate(template));
  } catch {
    res.status(404).json({ error: "template not found" });
  }
});

documentTemplatesRouter.delete("/:id", requireTemplateEditor, async (req: AuthedRequest, res: Response) => {
  try {
    const template = await prisma.documentTemplate.findUnique({ where: { id: req.params.id } });
    await prisma.documentTemplate.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "documentTemplate.delete",
      entityType: "DocumentTemplate",
      entityId: req.params.id,
      description: `Menghapus template dokumen "${template?.name ?? req.params.id}"`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "template not found" });
  }
});
