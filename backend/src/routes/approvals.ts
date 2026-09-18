import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, getUserRoles, userHasRoleTitle, type AuthedRequest } from "../auth";

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

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

// Personalized approval inbox: gate-approval tasks (requiresApproval,
// WAITING_APPROVAL) assigned to one of the caller's own roles, plus
// material requests still SUBMITTED (Project Manager's / Operational
// Manager's / Director's review queue — see DEC-051). Super admin sees
// everything, unfiltered — same "sees all, everyone else sees their own"
// pattern as GET /api/projects.
approvalsRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const isSuperAdmin = req.authUser!.isSuperAdmin;
  const roleIds = isSuperAdmin ? null : new Set((await getUserRoles(req.authUser!.id)).map((r) => r.id));
  const canReviewMaterialRequests =
    isSuperAdmin ||
    (await userHasRoleTitle(req.authUser!.id, "Project Manager")) ||
    (await userHasRoleTitle(req.authUser!.id, "Operational Manager")) ||
    (await userHasRoleTitle(req.authUser!.id, "Director"));

  const tasks = await prisma.task.findMany({
    where: { requiresApproval: true, status: "WAITING_APPROVAL" },
    orderBy: { dueDate: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      taskRoles: { include: { role: { select: { id: true, title: true } } } },
      attachments: attachmentInclude,
    },
  });
  const visibleTasks = isSuperAdmin
    ? tasks
    : tasks.filter((t) => t.taskRoles.some((tr) => roleIds!.has(tr.roleId)));

  const materialRequests = canReviewMaterialRequests
    ? await prisma.materialRequest.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { createdAt: "asc" },
        include: {
          items: true,
          project: { select: { id: true, name: true } },
          requestedByUser: { select: { id: true, name: true } },
          attachments: attachmentInclude,
        },
      })
    : [];

  res.json({
    tasks: visibleTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignedRoleIds: t.taskRoles.map((tr) => tr.role.id),
      assignedRoleTitles: t.taskRoles.map((tr) => tr.role.title),
      startDate: t.startDate,
      dueDate: t.dueDate,
      projectId: t.project.id,
      projectName: t.project.name,
      attachments: t.attachments.map(serializeAttachment),
    })),
    materialRequests: materialRequests.map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note,
      items: r.items.map((i) => ({ id: i.id, materialName: i.materialName, quantity: i.quantity, unit: i.unit, notes: i.notes })),
      projectId: r.project.id,
      projectName: r.project.name,
      requestedByUserName: r.requestedByUser.name,
      createdAt: r.createdAt,
      attachments: r.attachments.map(serializeAttachment),
    })),
  });
});
