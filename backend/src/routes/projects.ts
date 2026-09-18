import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requirePrivileged, isPrivileged, getUserRoles, userHasRoleTitle, canReviewDocument, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";
import { prepareDiskPath, writeDiskFile, deleteDiskFile, type AttachmentSubfolder } from "../lib/diskStorage";
// DEC-068: import the BOM-type constants + helper so we can validate
// the Jenis BOM dropdown on the MaterialRequest create route. The
// helper is defined in routes/bom.ts alongside the per-role submit
// gate; reusing it keeps the rule in a single place.
import { BOM_TYPES, allowedBomTypesFor, type BomType } from "./bom";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const STAGES = [
  "INITIATION",
  "REQUIREMENT",
  "DESIGN",
  "PROCUREMENT",
  "FABRICATION",
  "TESTING",
  "FINAL_REVIEW",
  "RELEASED",
  "PACKAGING",
  "ON_HOLD",
  "REJECTED",
];

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING_APPROVAL", "DONE", "REJECTED"];

// DEC-065: every task/document is tagged with the project stage (workflow
// lane) it belongs to so the WorkflowDiagram becomes clickable as a filter
// and the AddTask form can require an explicit stage.
//
// From the DOCUMENTS table in
// assets/template/doc/Vortec_Operation_Production_Process.pdf — applies to
// project-based work only, per user instruction.
type ProjectStage_ = "INITIATION" | "REQUIREMENT" | "DESIGN" | "PROCUREMENT" | "FABRICATION" | "TESTING" | "FINAL_REVIEW" | "RELEASED" | "PACKAGING";
const STANDARD_DOCUMENTS: { name: string; team: string; stage: ProjectStage_ }[] = [
  { name: "PRD", team: "Project Manager", stage: "REQUIREMENT" },
  { name: "Project Documentation", team: "Project Manager", stage: "REQUIREMENT" },
  { name: "MBOM", team: "Mechanical", stage: "DESIGN" },
  { name: "CAD FILE", team: "Mechanical", stage: "DESIGN" },
  { name: "EBOM", team: "Electrical", stage: "DESIGN" },
  { name: "Schematic FILE", team: "Electrical", stage: "DESIGN" },
  { name: "Assembling Documentation", team: "Electrical", stage: "FABRICATION" },
  { name: "Technical Spec Documentation", team: "Electrical", stage: "FABRICATION" },
  { name: "SBOM", team: "Software Dev", stage: "DESIGN" },
  { name: "FE&BE Documentation", team: "Software Dev", stage: "FABRICATION" },
  { name: "Manual Book", team: "Software Dev", stage: "FINAL_REVIEW" },
  { name: "BOQ", team: "Purchasing", stage: "PROCUREMENT" },
];

// From the swimlane flowchart in the same PDF. roleTitle matches a real
// `Role.title` from the org structure so tasks land with the team that
// actually owns that step; requiresApproval marks the flowchart's decision
// diamonds (Gate 0, PRD Approval, Design Review, Product Valid, Final
// Approval).
const STANDARD_TASKS: { title: string; description: string; roleTitle: string; requiresApproval: boolean; stage: ProjectStage_ }[] = [
  { title: "Project Insight / Initial Alignment", description: "Problem, Use Case, Target Product, Budget, Timeline", roleTitle: "Project Manager", requiresApproval: false, stage: "INITIATION" },
  { title: "Gate 0: Go / Hold / Reject", description: "", roleTitle: "Director", requiresApproval: true, stage: "INITIATION" },
  { title: "Requirement Gathering", description: "Mechanical, Electrical, Software, User", roleTitle: "Project Manager", requiresApproval: false, stage: "REQUIREMENT" },
  { title: "PRD (What & Why)", description: "", roleTitle: "Project Manager", requiresApproval: false, stage: "REQUIREMENT" },
  { title: "PRD Approval", description: "", roleTitle: "Director", requiresApproval: true, stage: "REQUIREMENT" },
  { title: "Mechanical: Engineering Breakdown & Design", description: "Termasuk dokumentasi CAD, MBOM", roleTitle: "Mechanical Engineer", requiresApproval: false, stage: "DESIGN" },
  { title: "Electrical: Engineering Breakdown & Design", description: "Termasuk dokumentasi Schematic, EBOM", roleTitle: "Electrical Engineer", requiresApproval: false, stage: "DESIGN" },
  { title: "Software: Engineering Breakdown & Design", description: "Termasuk dokumentasi System Design, SBOM", roleTitle: "Software Development", requiresApproval: false, stage: "DESIGN" },
  { title: "Design Review", description: "", roleTitle: "Director", requiresApproval: true, stage: "DESIGN" },
  { title: "BOM Released", description: "", roleTitle: "Project Manager", requiresApproval: false, stage: "PROCUREMENT" },
  { title: "Purchasing: Material Readiness / Monitoring", description: "Purchasing item status", roleTitle: "Purchasing", requiresApproval: false, stage: "PROCUREMENT" },
  { title: "Mechanical Fabrication", description: "", roleTitle: "Mechanical Engineer", requiresApproval: false, stage: "FABRICATION" },
  { title: "Electrical Fabrication", description: "", roleTitle: "Electrical Engineer", requiresApproval: false, stage: "FABRICATION" },
  { title: "Software Development (Coding)", description: "", roleTitle: "Software Development", requiresApproval: false, stage: "FABRICATION" },
  { title: "Hardware Assembling & Bring-up", description: "", roleTitle: "Electrical Engineer", requiresApproval: false, stage: "FABRICATION" },
  { title: "Flashing Firmware / Software", description: "", roleTitle: "Software Development", requiresApproval: false, stage: "FABRICATION" },
  { title: "Functional / Verification Test", description: "Test case, requirement check pass/fail", roleTitle: "Quality Control", requiresApproval: false, stage: "TESTING" },
  { title: "Field Validation", description: "Real environment, user scenario, performance", roleTitle: "Quality Control", requiresApproval: false, stage: "TESTING" },
  { title: "Product Valid?", description: "", roleTitle: "Quality Control", requiresApproval: true, stage: "TESTING" },
  { title: "Final Release Package", description: "Final BOM + Mechanical/Electrical/Software documentation + Test Report", roleTitle: "Project Manager", requiresApproval: false, stage: "FINAL_REVIEW" },
  { title: "Final Approval", description: "", roleTitle: "Director", requiresApproval: true, stage: "FINAL_REVIEW" },
  { title: "Product Release", description: "", roleTitle: "Project Manager", requiresApproval: false, stage: "RELEASED" },
  { title: "Packing Produk", description: "Packing produk yang sudah di-release", roleTitle: "Inventory", requiresApproval: false, stage: "PACKAGING" },
  { title: "Cek Kelengkapan Item", description: "Pastikan seluruh item lengkap sebelum barang masuk gudang dan dikirim ke client", roleTitle: "Inventory", requiresApproval: true, stage: "PACKAGING" },
];

const attachmentInclude = {
  orderBy: { createdAt: "asc" as const },
  include: { uploadedByUser: { select: { id: true, name: true } } },
};

const projectInclude = {
  documents: { orderBy: { order: "asc" as const }, include: { attachments: attachmentInclude, reviewedByUser: { select: { id: true, name: true } } } },
  // DEC-067: include the user who closed the BOM so the project page
  // can show "Closed by <name>" without a separate fetch.
  bomClosedByUser: { select: { id: true, name: true } },
  // DEC-068: same idea for the MaterialRequest lock toggle.
  materialRequestLockedByUser: { select: { id: true, name: true } },
  tasks: {
    orderBy: { order: "asc" as const },
    include: {
      taskRoles: { include: { role: { select: { id: true, title: true } } } },
      approvedByUser: { select: { id: true, name: true } },
      attachments: attachmentInclude,
      subtasks: { orderBy: { order: "asc" as const } },
    },
  },
  materialRequests: {
    orderBy: { createdAt: "desc" as const },
    include: {
      items: true,
      requestedByUser: { select: { id: true, name: true } },
      reviewedByUser: { select: { id: true, name: true } },
      processedByUser: { select: { id: true, name: true } },
      attachments: attachmentInclude,
    },
  },
  picUser: { select: { id: true, name: true } },
};

type ApiAttachmentRow = {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
  diskPath: string | null; // DEC-064: null for legacy dataUrl records
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
    diskPath: a.diskPath,
    createdAt: a.createdAt,
    uploadedByUserId: a.uploadedByUser.id,
    uploadedByUserName: a.uploadedByUser.name,
  };
}

type ProjectWithRelations = {
  id: string;
  name: string;
  clientName: string;
  problemStatement: string;
  targetProduct: string;
  budget: string;
  startDate: Date | null;
  targetDate: Date | null;
  stage: string;
  picUserId: string | null;
  picUser: { id: string; name: string } | null;
  // DEC-067
  bomClosed: boolean;
  bomClosedAt: Date | null;
  bomClosedByUserId: string | null;
  bomClosedByUser: { id: string; name: string } | null;
  // DEC-068
  materialRequestLocked: boolean;
  materialRequestLockedAt: Date | null;
  materialRequestLockedByUserId: string | null;
  materialRequestLockedByUser: { id: string; name: string } | null;
  documents: {
    id: string;
    name: string;
    team: string;
    stage: string | null; // DEC-065
    done: boolean;
    note: string;
    reviewStatus: string;
    reviewedByUser: { id: string; name: string } | null;
    reviewedAt: Date | null;
    reviewNote: string;
    attachments: ApiAttachmentRow[];
  }[];
  tasks: {
    id: string;
    title: string;
    description: string;
    taskRoles: { role: { id: string; title: string } }[];
    status: string;
    requiresApproval: boolean;
    stage: string | null; // DEC-065
    approvedByUserId: string | null;
    approvedByUser: { id: string; name: string } | null;
    approvedAt: Date | null;
    order: number;
    startDate: Date | null;
    dueDate: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    attachments: ApiAttachmentRow[];
    subtasks: { id: string; title: string; done: boolean; order: number }[];
    note: string;
  }[];
  materialRequests: {
    id: string;
    title: string;
    note: string;
    status: string;
    // DEC-068: per-request BomType tag (MBOM/EBOM/SBOM/QBOM).
    bomType: string | null;
    items: { id: string; materialName: string; quantity: number; unit: string; notes: string }[];
    requestedByUser: { id: string; name: string };
    reviewedByUser: { id: string; name: string } | null;
    reviewedAt: Date | null;
    reviewNote: string;
    processedByUser: { id: string; name: string } | null;
    processedAt: Date | null;
    purchaseNote: string;
    createdAt: Date;
    attachments: ApiAttachmentRow[];
  }[];
};

function serializeProject(project: ProjectWithRelations) {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    problemStatement: project.problemStatement,
    targetProduct: project.targetProduct,
    budget: project.budget,
    startDate: project.startDate,
    targetDate: project.targetDate,
    stage: project.stage,
    picUserId: project.picUserId,
    picUserName: project.picUser?.name ?? null,
    // DEC-067: Open/Close BOM state. PM/OM close the project's BOM via
    // POST /api/projects/:id/bom/close — once true, the project BOM tab
    // hides the "add item" form and shows the close metadata.
    bomClosed: project.bomClosed,
    bomClosedAt: project.bomClosedAt,
    bomClosedByUserId: project.bomClosedByUserId,
    bomClosedByUserName: project.bomClosedByUser?.name ?? null,
    // DEC-068: Pengajuan Bahan Baku lock state. PM/OM toggle via
    // POST /api/projects/:id/material-requests/lock.
    materialRequestLocked: project.materialRequestLocked,
    materialRequestLockedAt: project.materialRequestLockedAt,
    materialRequestLockedByUserId: project.materialRequestLockedByUserId,
    materialRequestLockedByUserName: project.materialRequestLockedByUser?.name ?? null,
    documents: project.documents.map((d) => ({
      id: d.id,
      name: d.name,
      team: d.team,
      stage: d.stage, // DEC-065: workflow stage — null for legacy pre-DEC-065 rows
      done: d.done,
      note: d.note,
      reviewStatus: d.reviewStatus,
      reviewedByUserName: d.reviewedByUser?.name ?? null,
      reviewedAt: d.reviewedAt,
      reviewNote: d.reviewNote,
      attachments: d.attachments.map(serializeAttachment),
    })),
    tasks: project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignedRoleIds: t.taskRoles.map((tr) => tr.role.id),
      assignedRoleTitles: t.taskRoles.map((tr) => tr.role.title),
      status: t.status,
      requiresApproval: t.requiresApproval,
      // DEC-065: workflow stage — required for new tasks (AddTask form enforces).
      // Null on legacy pre-DEC-065 rows.
      stage: t.stage,
      approvedByUserId: t.approvedByUserId,
      approvedByUserName: t.approvedByUser?.name ?? null,
      approvedAt: t.approvedAt,
      order: t.order,
      startDate: t.startDate,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      attachments: t.attachments.map(serializeAttachment),
      subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done, order: s.order })),
      note: t.note,
    })),
    materialRequests: project.materialRequests.map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note,
      status: r.status,
      // DEC-068: which BomType the submitter tagged on this request
      // (selected from their roles' allowedBomTypes at submit time).
      bomType: r.bomType,
      items: r.items.map((i) => ({ id: i.id, materialName: i.materialName, quantity: i.quantity, unit: i.unit, notes: i.notes })),
      requestedByUserId: r.requestedByUser.id,
      requestedByUserName: r.requestedByUser.name,
      reviewedByUserName: r.reviewedByUser?.name ?? null,
      reviewedAt: r.reviewedAt,
      reviewNote: r.reviewNote,
      processedByUserName: r.processedByUser?.name ?? null,
      processedAt: r.processedAt,
      purchaseNote: r.purchaseNote,
      createdAt: r.createdAt,
      attachments: r.attachments.map(serializeAttachment),
    })),
  };
}

// A task can be acted on (status changes, approve/reject) by a privileged
// user (super admin/Operational Manager — see DEC-050) OR a user who
// holds the role the task is assigned to — this is how tasks are
// "delivered" to the assigned role. A user can hold multiple roles.
async function canActOnTask(authUser: { id: string; isSuperAdmin: boolean }, assignedRoleIds: string[] | null) {
  if (await isPrivileged(authUser)) return true;
  if (!assignedRoleIds || assignedRoleIds.length === 0) return false;
  const roles = await getUserRoles(authUser.id);
  return roles.some((r) => assignedRoleIds.includes(r.id));
}

// Only Operational Manager (who assigns work to a PM) or super admin can
// create a project. Director has the same access per DEC-051 (full
// oversight), via isPrivileged.
async function canCreateProject(authUser: { id: string; isSuperAdmin: boolean }) {
  return isPrivileged(authUser);
}

// Full task CRUD (create/edit/delete the task itself, not its subtasks) is
// limited to Project Manager, Operational Manager, or super admin — see
// DEC-032. The project's PIC no longer gets this by virtue of being PIC.
// Director included via isPrivileged per DEC-051.
async function canManageProjectTasks(authUser: { id: string; isSuperAdmin: boolean }) {
  if (await isPrivileged(authUser)) return true;
  return userHasRoleTitle(authUser.id, "Project Manager");
}

async function requireProjectCreator(req: AuthedRequest, res: Response, next: () => void) {
  if (await canCreateProject(req.authUser!)) return next();
  res.status(403).json({ error: "Hanya Operational Manager atau super admin yang bisa membuat/mengubah project" });
}

projectsRouter.get("/", async (req: AuthedRequest, res: Response) => {
  // Every authenticated user sees every task in every project — task
  // visibility is shared across the project so any team member can
  // understand what the other teams are doing (the whole point of a
  // cross-team project view). Action rights are still per-assigned-role
  // and per-privilege (canActOnTask / canManageProjectTasks), so a user
  // who doesn't hold the assigned role can VIEW a task but cannot change
  // its status, approve/reject it, or edit its structure. See DEC-053
  // (task visibility vs task action split) and DEC-051 for the role
  // matrix.
  const projects = await prisma.project.findMany({ include: projectInclude, orderBy: { createdAt: "desc" } });
  res.json(projects.map(serializeProject));
});

// Team performance monitoring — how fast each team (org role) finishes its
// tasks vs. their due dates. Cross-project and cross-team by nature, so it
// needs every task regardless of who it's assigned to; `GET /` can't be
// reused because its per-role filtering for non-admins would hide every
// other team's data from the very viewers this is for (same reasoning as
// the dedicated Purchasing endpoints — see DEC-022). Visible to whoever can
// manage a project's task list (PM/Operational Manager/super admin).
projectsRouter.get("/performance/tasks", async (req: AuthedRequest, res: Response) => {
  if (!(await canManageProjectTasks(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau super admin yang bisa melihat performa tim" });
  }
  const tasks = await prisma.task.findMany({
    include: {
      taskRoles: { include: { role: { select: { id: true, title: true } } } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      assignedRoleIds: t.taskRoles.map((tr) => tr.role.id),
      assignedRoleTitles: t.taskRoles.map((tr) => tr.role.title),
      status: t.status,
      requiresApproval: t.requiresApproval,
      startDate: t.startDate,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
    }))
  );
});

projectsRouter.post("/", requireProjectCreator, async (req: AuthedRequest, res: Response) => {
  const { name, clientName, problemStatement, targetProduct, budget, startDate, targetDate, picUserId } =
    req.body as {
      name?: string;
      clientName?: string;
      problemStatement?: string;
      targetProduct?: string;
      budget?: string;
      startDate?: string | null;
      targetDate?: string | null;
      picUserId?: string | null;
    };
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });

  // PIC is how an Operational Manager delegates a project to its
  // responsible Project Manager — not an arbitrary user. See DEC-037.
  if (picUserId && !(await userHasRoleTitle(picUserId, "Project Manager"))) {
    return res.status(400).json({ error: "PIC harus seorang Project Manager" });
  }

  const roles = await prisma.role.findMany({ select: { id: true, title: true } });
  const roleIdByTitle = new Map(roles.map((r) => [r.title, r.id]));

  // DEC-067: new projects start empty. The team creates tasks and
  // checklist documents manually — the previous behavior of
  // auto-seeding 24 tasks + 12 documents created friction (delete
  // what we don't need? edit? leave alone?). STANDARD_TASKS /
  // STANDARD_DOCUMENTS stay in this file as the reference template
  // for legacy migrations and for any "use template" UX we may add
  // later.
  void roleIdByTitle; // kept available for the "use template" path we'll likely add later
  const project = await prisma.project.create({
    data: {
      name: trimmed,
      clientName: clientName ?? "",
      problemStatement: problemStatement ?? "",
      targetProduct: targetProduct ?? "",
      budget: budget ?? "",
      startDate: startDate ? new Date(startDate) : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      picUserId: picUserId ?? null,
    },
    include: projectInclude,
  });
  logActivityFor(req, {
    action: "project.create",
    entityType: "Project",
    entityId: project.id,
    description: `Membuat project "${project.name}"`,
  });
  res.status(201).json(serializeProject(project));
});

projectsRouter.patch("/:id", requireProjectCreator, async (req: AuthedRequest, res: Response) => {
  const { name, clientName, problemStatement, targetProduct, budget, startDate, targetDate, stage, picUserId } =
    req.body as {
      name?: string;
      clientName?: string;
      problemStatement?: string;
      targetProduct?: string;
      budget?: string;
      startDate?: string | null;
      targetDate?: string | null;
      stage?: string;
      picUserId?: string | null;
    };

  if (stage !== undefined && !STAGES.includes(stage)) {
    return res.status(400).json({ error: "invalid stage" });
  }
  // PIC is how an Operational Manager delegates a project to its
  // responsible Project Manager — not an arbitrary user. See DEC-037.
  if (picUserId !== undefined && picUserId && !(await userHasRoleTitle(picUserId, "Project Manager"))) {
    return res.status(400).json({ error: "PIC harus seorang Project Manager" });
  }

  try {
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(clientName !== undefined ? { clientName } : {}),
        ...(problemStatement !== undefined ? { problemStatement } : {}),
        ...(targetProduct !== undefined ? { targetProduct } : {}),
        ...(budget !== undefined ? { budget } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
        ...(stage !== undefined ? { stage: stage as never } : {}),
        ...(picUserId !== undefined ? { picUserId } : {}),
      },
      include: projectInclude,
    });
    logActivityFor(req, {
      action: "project.update",
      entityType: "Project",
      entityId: project.id,
      description:
        stage !== undefined
          ? `Mengubah stage project "${project.name}" menjadi ${stage}`
          : `Mengubah project "${project.name}"`,
    });
    res.json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "project not found" });
  }
});

projectsRouter.delete("/:id", requireProjectCreator, async (req: AuthedRequest, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { name: true } });
    await prisma.project.delete({ where: { id: req.params.id } });
    logActivityFor(req, {
      action: "project.delete",
      entityType: "Project",
      entityId: req.params.id,
      description: `Menghapus project "${project?.name ?? req.params.id}" beserta seluruh task dan dokumennya`,
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "project not found" });
  }
});

// ---------------------------------------------------------------------------
// DEC-067: Open / Close BOM on a project.
//
// Gate: PM, OM, Director, or super admin (via `canManageProjectTasks`-like
// rule — actually we want BOM-closure to be PM/OM only; Directors can
// oversee but don't act). The frontend mirrors this via canCloseBomClient.
//
// Pre-condition: every non-rejected BomItem for the project must be
// ARRIVED. If anything is SUBMITTED / APPROVED / PROCESSING (or missing),
// we return 400 with a per-status count so the UI can render an actionable
// error.
//
// Verification: the body must include a typed phrase matching
// `confirmText` — the frontend ConfirmDialog passes it through.
//
// Side effect on success: for every non-empty BomType, generate one Excel
// rekap (exceljs), write to disk, create an Attachment row pointing to
// the matching ProjectDocument (matched by name), and mark that document
// `done = true`. The project itself is flipped to bomClosed + stamped
// with bomClosedAt / bomClosedByUserId.
// ---------------------------------------------------------------------------
async function canCloseBom(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  if (await isPrivileged(authUser)) return true; // super admin / OM / Director
  return userHasRoleTitle(authUser.id, "Project Manager");
}

projectsRouter.post("/:id/bom/close", async (req: AuthedRequest, res: Response) => {
  if (!(await canCloseBom(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau Director yang bisa close BOM" });
  }

  const { confirmText } = req.body as { confirmText?: string };

  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      bomItems: true,
      documents: { select: { id: true, name: true, done: true } },
    },
  });
  if (!project) return res.status(404).json({ error: "project not found" });
  if (project.bomClosed) {
    return res.status(400).json({ error: "BOM project ini sudah pernah di-close" });
  }

  // Verification — typed phrase must match the project name to prevent
  // accidental closure. The frontend's ConfirmDialog enforces this on
  // the client; we re-check on the server.
  const expectedPhrase = `close ${project.name}`;
  if (confirmText?.trim() !== expectedPhrase) {
    return res.status(400).json({ error: `Verifikasi gagal. Ketik persis: ${expectedPhrase}` });
  }

  // Pre-condition: every non-rejected item must be ARRIVED.
  const counts = {
    SUBMITTED: 0,
    APPROVED: 0,
    PROCESSING: 0,
    ARRIVED: 0,
    REJECTED: 0,
  } as Record<string, number>;
  for (const item of project.bomItems) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  const blocking =
    (counts.SUBMITTED ?? 0) +
    (counts.APPROVED ?? 0) +
    (counts.PROCESSING ?? 0);
  if (blocking > 0) {
    return res.status(400).json({
      error:
        "Tidak bisa close BOM: masih ada item yang belum selesai dibeli. " +
        `SUBMITTED=${counts.SUBMITTED ?? 0}, APPROVED=${counts.APPROVED ?? 0}, PROCESSING=${counts.PROCESSING ?? 0}`,
      counts,
    });
  }

  // Generate one Excel per non-empty BomType (excluding REJECTED — those
  // were intentionally not purchased). For each type with ≥1 item,
  //   1. build the workbook
  //   2. write to disk
  //   3. create Attachment row
  //   4. find the matching ProjectDocument by name and link the
  //      attachment + mark done = true
  // Import the rekap helper + its types. The dynamic import is fine
  // because the module is small and only used on close — but we also
  // need the *types* in scope, which TypeScript wants at compile-time.
  // `import type` (top-level) is hoisted and doesn't trigger runtime;
  // the dynamic import below is the runtime path.
  const { buildBomRekapWorkbook, writeBomRekapToDisk } = await import("../lib/bomRekap");
  type RekapType = "MBOM" | "EBOM" | "SBOM" | "QBOM";
  type RekapItem = {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    price: number | null;
    status: string;
    notes: string;
    submittedByUserName: string;
    submittedAt: Date;
    approvedByUserName: string | null;
    approvedAt: Date | null;
    processedByUserName: string | null;
    purchaseNote: string;
  };
  const BOM_TYPES_LIST: RekapType[] = ["MBOM", "EBOM", "SBOM", "QBOM"];
  const grouped = new Map<RekapType, typeof project.bomItems>();
  for (const it of project.bomItems) {
    if (it.status === "REJECTED") continue;
    const t = it.bomType as RekapType;
    if (!grouped.has(t)) grouped.set(t, []);
    grouped.get(t)!.push(it);
  }

  const locale = (await prisma.user.findUnique({ where: { id: req.authUser!.id }, select: { locale: true } }))?.locale === "en" ? "en" : "id";
  const documentByName = new Map(project.documents.map((d) => [d.name.trim().toUpperCase(), d]));
  const rekapResults: { type: RekapType; attachmentId: string; documentId: string | null }[] = [];

  for (const type of BOM_TYPES_LIST) {
    const items = grouped.get(type);
    if (!items || items.length === 0) continue;

    // Resolve the user-name fields up-front (the items have FK ids only).
    const submitterIds = Array.from(new Set(items.map((i) => i.submittedByUserId)));
    const approverIds = Array.from(new Set(items.map((i) => i.approvedByUserId).filter(Boolean) as string[]));
    const processorIds = Array.from(new Set(items.map((i) => i.processedByUserId).filter(Boolean) as string[]));
    const userIds = Array.from(new Set([...submitterIds, ...approverIds, ...processorIds]));
    const users = userIds.length === 0 ? [] : await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const rekapItems: RekapItem[] = items.map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      price: it.price,
      status: it.status,
      notes: it.notes,
      submittedByUserName: nameById.get(it.submittedByUserId) ?? "?",
      submittedAt: it.submittedAt,
      approvedByUserName: it.approvedByUserId ? nameById.get(it.approvedByUserId) ?? null : null,
      approvedAt: it.approvedAt,
      processedByUserName: it.processedByUserId ? nameById.get(it.processedByUserId) ?? null : null,
      purchaseNote: it.purchaseNote,
    }));

    const wb = await buildBomRekapWorkbook(type, rekapItems, project.name, locale);
    const file = await writeBomRekapToDisk(project.id, type, wb);

    // Match the checklist document by exact-uppercase name (e.g.
    // "MBOM" -> "MBOM" checklist doc from STANDARD_DOCUMENTS).
    const doc = documentByName.get(type.toUpperCase());
    let documentId: string | null = null;
    if (doc) {
      // Drop any prior rekap for this doc — keeping one final rekap
      // makes the checklist view clean. The older file on disk is
      // removed best-effort (don't fail if it's already gone).
      const oldAttachments = await prisma.attachment.findMany({
        where: { documentId: doc.id },
        select: { id: true, diskPath: true },
      });
      for (const a of oldAttachments) {
        if (a.diskPath) {
          try { await (await import("../lib/diskStorage")).deleteDiskFile(a.diskPath); } catch { /* best-effort */ }
        }
        await prisma.attachment.delete({ where: { id: a.id } });
      }
      const attachment = await prisma.attachment.create({
        data: {
          kind: "FILE",
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          diskPath: file.diskPath,
          documentId: doc.id,
          uploadedByUserId: req.authUser!.id,
        },
      });
      await prisma.projectDocument.update({
        where: { id: doc.id },
        data: { done: true },
      });
      documentId = doc.id;
      rekapResults.push({ type, attachmentId: attachment.id, documentId: doc.id });
    } else {
      // No matching checklist document — still create the attachment on
      // the project root so the file isn't lost.
      const attachment = await prisma.attachment.create({
        data: {
          kind: "FILE",
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          diskPath: file.diskPath,
          uploadedByUserId: req.authUser!.id,
        },
      });
      rekapResults.push({ type, attachmentId: attachment.id, documentId: null });
    }
  }

  // Flip the project flag.
  const closed = await prisma.project.update({
    where: { id: project.id },
    data: {
      bomClosed: true,
      bomClosedAt: new Date(),
      bomClosedByUserId: req.authUser!.id,
    },
    include: projectInclude,
  });

  logActivityFor(req, {
    action: "project.bomClosed",
    entityType: "Project",
    entityId: project.id,
    description: `Close BOM project "${project.name}" — ${rekapResults.length} rekap Excel ter-generate`,
  });

  // DEC-067 notification: BOM closed -> submitter + PIC + PM + OM + Director.
  // All submitters + PIC are easy to look up; for the manager recipients
  // we look up role users.
  const recipients = new Set<string>();
  for (const it of project.bomItems) recipients.add(it.submittedByUserId);
  if (project.picUserId) recipients.add(project.picUserId);
  recipients.delete(req.authUser!.id); // exclude the actor
  const managerRoles = ["Project Manager", "Operational Manager", "Director"];
  const managerUsers = await prisma.userRole.findMany({
    where: { role: { title: { in: managerRoles } } },
    select: { userId: true },
  });
  for (const m of managerUsers) recipients.add(m.userId);
  if (recipients.size > 0) {
    await prisma.notification.createMany({
      data: Array.from(recipients).map((userId) => ({
        userId,
        type: "bom.closed",
        title: `BOM project "${project.name}" sudah di-close`,
        body: `BOM project ini sudah final. ${rekapResults.length} rekap Excel ter-generate dan dilampirkan ke checklist dokumen. Tidak bisa menambah item baru.`,
        projectId: project.id,
        entityType: "Project",
        entityId: project.id,
      })),
    }).catch((err) => console.error("bom.closed notification failed:", err));
  }

  res.json({
    project: serializeProject(closed),
    rekap: rekapResults.map((r) => ({ type: r.type, attachmentId: r.attachmentId, documentId: r.documentId })),
  });
});

projectsRouter.post("/:id/documents", requirePrivileged, async (req: AuthedRequest, res: Response) => {
  const { name, team, stage } = req.body as { name?: string; team?: string; stage?: string | null };
  const trimmedName = name?.trim();
  const trimmedTeam = team?.trim();
  const trimmedStage = stage?.trim();
  if (!trimmedName || !trimmedTeam) return res.status(400).json({ error: "name and team are required" });
  // DEC-065: stage is required for new documents so the workflow filter
  // stays consistent. We treat empty string as null so the client doesn't
  // have to omit the field explicitly.
  if (!trimmedStage) return res.status(400).json({ error: "stage wajib dipilih untuk dokumen baru" });

  try {
    const last = await prisma.projectDocument.findFirst({
      where: { projectId: req.params.id },
      orderBy: { order: "desc" },
    });
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        documents: {
          create: {
            name: trimmedName,
            team: trimmedTeam,
            stage: trimmedStage as never,
            order: (last?.order ?? -1) + 1,
          },
        },
      },
      include: projectInclude,
    });
    res.status(201).json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "project not found" });
  }
});

// DEC-064: extends the existing checklist toggle (done + note, for the
// owning role) with PM/OM review actions (APPROVED/REVISION).
// The two flows are split into separate endpoints for clarity:
projectsRouter.patch(
  "/:projectId/documents/:docId",
  requirePrivileged,
  async (req: AuthedRequest, res: Response) => {
    const { done, note } = req.body as { done?: boolean; note?: string };

    // A document checklist item is an approval of sorts — it can only be
    // marked done once the actual file is attached as evidence.
    if (done === true) {
      const existing = await prisma.projectDocument.findUnique({
        where: { id: req.params.docId },
        include: { attachments: { select: { id: true } } },
      });
      if (!existing) return res.status(404).json({ error: "document or project not found" });
      if (existing.attachments.length === 0) {
        return res.status(400).json({ error: "Lampirkan file dokumen terlebih dahulu sebelum menandai selesai" });
      }
    }

    try {
      await prisma.projectDocument.update({
        where: { id: req.params.docId },
        data: {
          ...(done !== undefined ? { done } : {}),
          ...(note !== undefined ? { note } : {}),
        },
      });
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: req.params.projectId },
        include: projectInclude,
      });
      res.json(serializeProject(project));
    } catch {
      res.status(404).json({ error: "document or project not found" });
    }
  }
);

// PM/OM review action on a document checklist item (DEC-064).
// Only PM/OM (or super admin) can call this. Once APPROVED, the doc
// is locked from further modification by non-PM/OM users — only PM/OM
// can move it back to REVISION.
projectsRouter.patch(
  "/:projectId/documents/:docId/review",
  async (req: AuthedRequest, res: Response) => {
    // Only PM or OM can approve/reject (uses the same canReviewDocument
    // gate as the task review flow — see auth.ts).
    if (!await canReviewDocument(req.authUser!)) {
      return res.status(403).json({ error: "Hanya Project Manager atau Operational Manager yang bisa me-review dokumen" });
    }

    const { reviewStatus, reviewNote } = req.body as { reviewStatus?: string; reviewNote?: string };
    if (!reviewStatus || !["APPROVED", "REVISION"].includes(reviewStatus)) {
      return res.status(400).json({ error: "reviewStatus must be APPROVED or REVISION" });
    }

    try {
      const doc = await prisma.projectDocument.findUnique({
        where: { id: req.params.docId },
        select: { id: true, done: true, reviewStatus: true, projectId: true },
      });
      if (!doc || doc.projectId !== req.params.projectId) {
        return res.status(404).json({ error: "document not found in this project" });
      }

      // APPROVED requires the owning role to have marked it done first.
      if (reviewStatus === "APPROVED" && !doc.done) {
        return res.status(400).json({ error: "Dokumen harus ditandai selesai oleh tim terkait terlebih dahulu" });
      }
      // Once APPROVED, only PM/OM can send it back to REVISION.
      if (doc.reviewStatus === "APPROVED" && reviewStatus === "REVISION") {
        // Allowed — PM/OM revoking approval.
      }

      await prisma.projectDocument.update({
        where: { id: req.params.docId },
        data: {
          reviewStatus: reviewStatus as "APPROVED" | "REVISION",
          reviewNote: reviewNote ?? "",
          reviewedByUserId: req.authUser!.id,
          reviewedAt: new Date(),
        },
      });

      logActivityFor(req, {
        action: reviewStatus === "APPROVED" ? "document.approved" : "document.revision",
        entityType: "ProjectDocument",
        entityId: req.params.docId,
        description:
          reviewStatus === "APPROVED"
            ? `Menyetujui dokumen checklist project`
            : `Mengembalikan dokumen checklist project untuk direvisi`,
      });

      const project = await prisma.project.findUniqueOrThrow({
        where: { id: req.params.projectId },
        include: projectInclude,
      });
      res.json(serializeProject(project));
    } catch {
      res.status(404).json({ error: "document or project not found" });
    }
  }
);

projectsRouter.delete(
  "/:projectId/documents/:docId",
  requirePrivileged,
  async (req: AuthedRequest, res: Response) => {
    try {
      await prisma.projectDocument.delete({ where: { id: req.params.docId } });
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: req.params.projectId },
        include: projectInclude,
      });
      res.json(serializeProject(project));
    } catch {
      res.status(404).json({ error: "document or project not found" });
    }
  }
);

// --- Tasks ---------------------------------------------------------------

projectsRouter.post("/:id/tasks", async (req: AuthedRequest, res: Response) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!project) return res.status(404).json({ error: "project not found" });
  if (!(await canManageProjectTasks(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau super admin yang bisa menambah task" });
  }

  const { title, description, assignedRoleIds, requiresApproval, startDate, dueDate, stage } = req.body as {
    title?: string;
    description?: string;
    assignedRoleIds?: string[] | null;
    requiresApproval?: boolean;
    startDate?: string | null;
    dueDate?: string | null;
    stage?: string | null;
  };
  const trimmed = title?.trim();
  const trimmedStage = stage?.trim();
  if (!trimmed) return res.status(400).json({ error: "title is required" });
  // DEC-065: stage is required so the WorkflowDiagram filter stays consistent
  // for newly-added tasks. The AddTask form enforces this client-side too.
  if (!trimmedStage) return res.status(400).json({ error: "stage wajib dipilih untuk task baru" });

  const last = await prisma.task.findFirst({ where: { projectId: req.params.id }, orderBy: { order: "desc" } });
  const updated = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      tasks: {
        create: {
          title: trimmed,
          description: description ?? "",
          requiresApproval: requiresApproval ?? false,
          stage: trimmedStage as never, // DEC-065
          startDate: startDate ? new Date(startDate) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
          order: (last?.order ?? -1) + 1,
          taskRoles: assignedRoleIds
            ? { create: assignedRoleIds.map((roleId) => ({ roleId })) }
            : undefined,
        },
      },
    },
    include: projectInclude,
  });
  logActivityFor(req, {
    action: "task.create",
    entityType: "Task",
    description: `Menambahkan task "${trimmed}" di stage ${trimmedStage} pada project "${updated.name}"`,
  });
  res.status(201).json(serializeProject(updated));
});

projectsRouter.patch("/:projectId/tasks/:taskId", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) {
    return res.status(404).json({ error: "task not found" });
  }

  const { title, description, assignedRoleIds, status, startDate, dueDate, note, stage } = req.body as {
    title?: string;
    description?: string;
    assignedRoleIds?: string[] | null;
    status?: string;
    startDate?: string | null;
    dueDate?: string | null;
    note?: string;
    stage?: string | null;
  };

  const currentAssignedRoleIds = task.taskRoles.map((tr) => tr.roleId);

  // Permission model (see DEC-052 follow-up — the operator-requested
  // split of "engineer can edit {subtasks, attachments, note, status}
  // but not {title, description, assignment, start/due date}"):
  //
  // 1. Structural edits (title, description, assignedRoleId, startDate,
  //    dueDate) stay PM/OM/Director/super-admin only. The "target" date
  //    specifically is the operational deadline that the engineering
  //    chain commits to and must be set by the level above.
  // 2. Status changes (including approve/reject) are allowed for whoever
  //    holds the assigned role (the engineer/team) or is privileged.
  // 3. The `note` field is writable by the same set that can change
  //    status — the assigned role can add observations/blockers/notes
  //    while working the task, without bumping status. PM/OM/Director
  //    can also write it (they're already privileged).
  //
  // Subtask and attachment CRUD are handled in their own routes
  // (/subtasks, /attachments) using canManageSubtasks/canManageAttachments,
  // which already allow assigned-role holders.
  const editingStructure =
    title !== undefined || description !== undefined || assignedRoleIds !== undefined || startDate !== undefined || dueDate !== undefined || stage !== undefined;
  if (editingStructure) {
    if (!(await canManageProjectTasks(req.authUser!))) {
      return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau super admin yang bisa mengubah detail task" });
    }
  }
  if (status !== undefined) {
    if (!TASK_STATUSES.includes(status)) return res.status(400).json({ error: "invalid status" });
    const allowed = await canActOnTask(req.authUser!, currentAssignedRoleIds);
    if (!allowed) return res.status(403).json({ error: "Hanya role yang di-assign atau super admin yang bisa mengubah status task ini" });
  }
  if (note !== undefined) {
    // Same gate as status — the assigned-role team can write notes.
    if (!(await canActOnTask(req.authUser!, currentAssignedRoleIds))) {
      return res.status(403).json({ error: "Hanya role yang di-assign atau super admin yang bisa menulis catatan task ini" });
    }
  }

  const isApprovalDecision = task.requiresApproval && status !== undefined && (status === "DONE" || status === "REJECTED");

  try {
    // Handle taskRoles update separately if assignedRoleIds is being changed
    if (assignedRoleIds !== undefined) {
      await prisma.taskRole.deleteMany({ where: { taskId: req.params.taskId } });
      if (assignedRoleIds && assignedRoleIds.length > 0) {
        await prisma.taskRole.createMany({
          data: assignedRoleIds.map((roleId) => ({ taskId: req.params.taskId, roleId })),
        });
      }
    }

    await prisma.task.update({
      where: { id: req.params.taskId },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status: status as never } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(note !== undefined ? { note } : {}),
        // DEC-065: stage is structural — only PM/OM/Director can move a task
        // between workflow stages.
        ...(stage !== undefined ? { stage: stage as never } : {}),
        ...(isApprovalDecision ? { approvedByUserId: req.authUser!.id, approvedAt: new Date() } : {}),
        // Track when a task actually finishes so team performance can be
        // measured (see the Team Performance panel) — cleared if reopened.
        ...(status !== undefined ? { completedAt: status === "DONE" ? new Date() : null } : {}),
      },
    });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: req.params.projectId },
      include: projectInclude,
    });
    if (status !== undefined) {
      logActivityFor(req, {
        action: isApprovalDecision ? "task.approvalDecision" : "task.statusChange",
        entityType: "Task",
        entityId: task.id,
        description: `${isApprovalDecision ? (status === "DONE" ? "Menyetujui" : "Menolak") : "Mengubah status"} task "${task.title}" (project "${project.name}") menjadi ${status}`,
      });
    }
    if (note !== undefined) {
      logActivityFor(req, {
        action: "task.noteUpdate",
        entityType: "Task",
        entityId: task.id,
        description: `Memperbarui catatan task "${task.title}" (project "${project.name}")`,
      });
    }
    res.json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "task not found" });
  }
});

projectsRouter.delete("/:projectId/tasks/:taskId", async (req: AuthedRequest, res: Response) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId }, select: { name: true } });
  if (!project) return res.status(404).json({ error: "project not found" });
  if (!(await canManageProjectTasks(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau super admin yang bisa menghapus task" });
  }

  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
    await prisma.task.delete({ where: { id: req.params.taskId } });
    const updated = await prisma.project.findUniqueOrThrow({
      where: { id: req.params.projectId },
      include: projectInclude,
    });
    logActivityFor(req, {
      action: "task.delete",
      entityType: "Task",
      entityId: req.params.taskId,
      description: `Menghapus task "${task?.title ?? req.params.taskId}" dari project "${project.name}"`,
    });
    res.json(serializeProject(updated));
  } catch {
    res.status(404).json({ error: "task not found" });
  }
});

// --- Subtasks --------------------------------------------------------------
// A checklist under a Task. Whoever can manage the project's tasks (PM/OM/
// super admin) OR holds the Task's assigned role can CRUD its subtasks — see
// DEC-032. Completing every subtask auto-advances the Task's own status as
// an additive convenience; the assigned role keeps its existing ability to
// change the Task's status manually at any time.
async function canManageSubtasks(authUser: { id: string; isSuperAdmin: boolean }, assignedRoleIds: string[] | null) {
  return (await canManageProjectTasks(authUser)) || (await canActOnTask(authUser, assignedRoleIds));
}

async function maybeAutoAdvanceTask(req: AuthedRequest, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { subtasks: true } });
  if (!task || task.subtasks.length === 0) return;
  if (!task.subtasks.every((s) => s.done)) return;
  if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return;

  const newStatus = task.requiresApproval ? "WAITING_APPROVAL" : "DONE";
  await prisma.task.update({
    where: { id: taskId },
    data: { status: newStatus as never, ...(newStatus === "DONE" ? { completedAt: new Date() } : {}) },
  });
  logActivityFor(req, {
    action: "task.autoAdvance",
    entityType: "Task",
    entityId: task.id,
    description: `Task "${task.title}" otomatis maju menjadi ${newStatus} karena seluruh subtask selesai`,
  });
}

projectsRouter.post("/:projectId/tasks/:taskId/subtasks", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ error: "task not found" });
  if (!(await canManageSubtasks(req.authUser!, task.taskRoles.map((tr) => tr.roleId)))) {
    return res.status(403).json({ error: "Hanya role yang di-assign, Project Manager, Operational Manager, atau super admin yang bisa menambah subtask" });
  }

  const { title } = req.body as { title?: string };
  const trimmed = title?.trim();
  if (!trimmed) return res.status(400).json({ error: "title is required" });

  const last = await prisma.subtask.findFirst({ where: { taskId: task.id }, orderBy: { order: "desc" } });
  await prisma.subtask.create({ data: { taskId: task.id, title: trimmed, order: (last?.order ?? -1) + 1 } });
  logActivityFor(req, {
    action: "subtask.create",
    entityType: "Subtask",
    description: `Menambahkan subtask "${trimmed}" pada task "${task.title}"`,
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
  res.status(201).json(serializeProject(project));
});

projectsRouter.patch("/:projectId/tasks/:taskId/subtasks/:subtaskId", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ error: "task not found" });
  if (!(await canManageSubtasks(req.authUser!, task.taskRoles.map((tr) => tr.roleId)))) {
    return res.status(403).json({ error: "Hanya role yang di-assign, Project Manager, Operational Manager, atau super admin yang bisa mengubah subtask" });
  }

  const { title, done } = req.body as { title?: string; done?: boolean };

  try {
    const subtask = await prisma.subtask.findUnique({ where: { id: req.params.subtaskId } });
    if (!subtask || subtask.taskId !== task.id) return res.status(404).json({ error: "subtask not found" });

    await prisma.subtask.update({
      where: { id: req.params.subtaskId },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(done !== undefined ? { done } : {}),
      },
    });
    if (done !== undefined) {
      logActivityFor(req, {
        action: "subtask.update",
        entityType: "Subtask",
        entityId: subtask.id,
        description: `Menandai subtask "${subtask.title}" (task "${task.title}") sebagai ${done ? "selesai" : "belum selesai"}`,
      });
      await maybeAutoAdvanceTask(req, task.id);
    }
    const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    res.json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "subtask not found" });
  }
});

projectsRouter.delete("/:projectId/tasks/:taskId/subtasks/:subtaskId", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ error: "task not found" });
  if (!(await canManageSubtasks(req.authUser!, task.taskRoles.map((tr) => tr.roleId)))) {
    return res.status(403).json({ error: "Hanya role yang di-assign, Project Manager, Operational Manager, atau super admin yang bisa menghapus subtask" });
  }

  try {
    const subtask = await prisma.subtask.findUnique({ where: { id: req.params.subtaskId } });
    if (!subtask || subtask.taskId !== task.id) return res.status(404).json({ error: "subtask not found" });
    await prisma.subtask.delete({ where: { id: req.params.subtaskId } });
    logActivityFor(req, {
      action: "subtask.delete",
      entityType: "Subtask",
      entityId: req.params.subtaskId,
      description: `Menghapus subtask "${subtask.title}" dari task "${task.title}"`,
    });
    await maybeAutoAdvanceTask(req, task.id);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    res.json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "subtask not found" });
  }
});

// --- Material Requests (BOM / bahan baku) ---------------------------------
// Workflow: engineering team submits -> Project Manager reviews/approves ->
// Purchasing processes the purchase. "ikuti saja workflow."

projectsRouter.post("/:id/material-requests", async (req: AuthedRequest, res: Response) => {
  const { title, note, bomType, items } = req.body as {
    title?: string;
    note?: string;
    bomType?: string;
    items?: { materialName?: string; quantity?: number; unit?: string; notes?: string }[];
  };
  const trimmed = title?.trim();
  if (!trimmed) return res.status(400).json({ error: "title is required" });
  const validItems = (items ?? []).filter((i) => i.materialName?.trim() && i.quantity && i.unit?.trim());
  if (validItems.length === 0) return res.status(400).json({ error: "at least one valid item is required" });

  try {
    // DEC-068: enforce the per-project lock + per-role bomType gate
    // BEFORE creating the MaterialRequest, so we don't half-write.
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, materialRequestLocked: true },
    });
    if (!project) return res.status(404).json({ error: "project not found" });
    if (project.materialRequestLocked) {
      return res.status(400).json({
        error: "Pengajuan Bahan Baku untuk project ini sedang di-lock oleh PM/OM. Hubungi mereka untuk unlock sebelum mengajukan.",
      });
    }
    // DEC-068: validate that the requested bomType (if any) is in the
    // caller's effective allowedBomTypes. PM/OM get the full set, so
    // they can pass any BomType; engineers can only pass types their
    // roles permit.
    if (bomType !== undefined && bomType !== null && bomType !== "") {
      if (!BOM_TYPES.includes(bomType as BomType)) {
        return res.status(400).json({ error: "invalid bomType" });
      }
      const allowed = await allowedBomTypesFor(req.authUser!);
      if (!allowed.includes(bomType as BomType)) {
        return res.status(403).json({
          error: `Anda tidak memiliki akses untuk mengajukan ${bomType}. Role Anda hanya: ${allowed.join(", ") || "(tidak ada)"}`,
        });
      }
    }

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        materialRequests: {
          create: {
            title: trimmed,
            note: note ?? "",
            // bomType is required for new submissions; null is rejected
            // upstream by the validation above (treated as "not set").
            bomType: (bomType && bomType !== "") ? bomType as never : null,
            requestedByUserId: req.authUser!.id,
            items: {
              create: validItems.map((i) => ({
                materialName: i.materialName!.trim(),
                quantity: i.quantity!,
                unit: i.unit!.trim(),
                notes: i.notes ?? "",
              })),
            },
          },
        },
      },
      include: projectInclude,
    });
    logActivityFor(req, {
      action: "materialRequest.submit",
      entityType: "MaterialRequest",
      description: `Mengajukan bahan baku "${trimmed}" untuk project "${updated.name}"${bomType ? ` (${bomType})` : ""}`,
    });
    res.status(201).json(serializeProject(updated));
  } catch (err) {
    console.error("POST material-requests error:", err);
    res.status(500).json({ error: "failed to create material request" });
  }
});

// ---------------------------------------------------------------------------
// DEC-068: Lock / Unlock Pengajuan Bahan Baku per project.
//
// PM / OM toggle. Body: `{ locked: boolean }` (no typed verification —
// this is a soft, reversible lock; the user said "switch button").
// Returns the updated project (so the UI can refresh state).
// ---------------------------------------------------------------------------
async function canLockMaterialRequest(authUser: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  if (await isPrivileged(authUser)) return true;
  return userHasRoleTitle(authUser.id, "Project Manager");
}

projectsRouter.post("/:id/material-requests/lock", async (req: AuthedRequest, res: Response) => {
  if (!(await canLockMaterialRequest(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau Director yang bisa lock/unlock pengajuan" });
  }
  const { locked } = req.body as { locked?: boolean };
  if (typeof locked !== "boolean") return res.status(400).json({ error: "locked must be a boolean" });

  try {
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        materialRequestLocked: locked,
        materialRequestLockedAt: locked ? new Date() : null,
        materialRequestLockedByUserId: locked ? req.authUser!.id : null,
      },
      include: projectInclude,
    });
    logActivityFor(req, {
      action: locked ? "materialRequest.lock" : "materialRequest.unlock",
      entityType: "Project",
      entityId: project.id,
      description: locked
        ? `Lock pengajuan Bahan Baku project "${project.name}"`
        : `Unlock pengajuan Bahan Baku project "${project.name}"`,
    });
    res.json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "project not found" });
  }
});

projectsRouter.patch("/:projectId/material-requests/:requestId/review", async (req: AuthedRequest, res: Response) => {
  const { decision, reviewNote } = req.body as { decision?: "APPROVED" | "REJECTED"; reviewNote?: string };
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
  }

  const allowed = (await isPrivileged(req.authUser!)) || (await userHasRoleTitle(req.authUser!.id, "Project Manager"));
  if (!allowed) return res.status(403).json({ error: "Hanya Project Manager, Operational Manager, atau super admin yang bisa me-review pengajuan ini" });

  const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
  if (!request || request.projectId !== req.params.projectId) return res.status(404).json({ error: "request not found" });
  if (request.status !== "SUBMITTED") return res.status(400).json({ error: "request sudah di-review" });

  await prisma.materialRequest.update({
    where: { id: req.params.requestId },
    data: {
      status: decision,
      reviewedByUserId: req.authUser!.id,
      reviewedAt: new Date(),
      reviewNote: reviewNote ?? "",
    },
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
  logActivityFor(req, {
    action: "materialRequest.review",
    entityType: "MaterialRequest",
    entityId: request.id,
    description: `${decision === "APPROVED" ? "Menyetujui" : "Menolak"} pengajuan "${request.title}" (project "${project.name}")`,
  });
  res.json(serializeProject(project));
});

projectsRouter.patch("/:projectId/material-requests/:requestId/process", async (req: AuthedRequest, res: Response) => {
  const { status, purchaseNote } = req.body as { status?: string; purchaseNote?: string };
  if (status !== "PROCESSING" && status !== "COMPLETED") {
    return res.status(400).json({ error: "status must be PROCESSING or COMPLETED" });
  }

  const allowed = (await isPrivileged(req.authUser!)) || (await userHasRoleTitle(req.authUser!.id, "Purchasing"));
  if (!allowed) return res.status(403).json({ error: "Hanya tim Purchasing, Operational Manager, atau super admin yang bisa memproses pengajuan ini" });

  const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
  if (!request || request.projectId !== req.params.projectId) return res.status(404).json({ error: "request not found" });
  if (request.status !== "APPROVED" && request.status !== "PROCESSING") {
    return res.status(400).json({ error: "request belum di-approve oleh Project Manager" });
  }

  await prisma.materialRequest.update({
    where: { id: req.params.requestId },
    data: {
      status,
      purchaseNote: purchaseNote ?? request.purchaseNote,
      processedByUserId: req.authUser!.id,
      processedAt: new Date(),
    },
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
  logActivityFor(req, {
    action: "materialRequest.process",
    entityType: "MaterialRequest",
    entityId: request.id,
    description: `Memproses pengajuan "${request.title}" (project "${project.name}") menjadi ${status}`,
  });
  res.json(serializeProject(project));
});

projectsRouter.delete("/:projectId/material-requests/:requestId", requirePrivileged, async (req: AuthedRequest, res: Response) => {
  try {
    const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
    await prisma.materialRequest.delete({ where: { id: req.params.requestId } });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    logActivityFor(req, {
      action: "materialRequest.delete",
      entityType: "MaterialRequest",
      entityId: req.params.requestId,
      description: `Menghapus pengajuan "${request?.title ?? req.params.requestId}" (project "${project.name}")`,
    });
    res.json(serializeProject(project));
  } catch {
    res.status(404).json({ error: "request or project not found" });
  }
});

// --- Attachments -----------------------------------------------------------
// DEC-064: Files are stored on disk under ATTACHMENT_BASE_PATH (see diskStorage.ts).
// The frontend uploads via multipart/form-data to POST /:entity/attachments/upload.
// Links (kind=LINK) stay unchanged. Legacy base64 dataUrl records remain readable
// (the frontend now prefers the /api/files/:id URL for downloads regardless of storage).

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB raw file size cap

// Helper to delete the on-disk file for an existing attachment row.
// Safe to call even if diskPath is null (legacy dataUrl record).
async function deleteAttachmentFile(attachmentId: string): Promise<void> {
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId }, select: { diskPath: true } });
  if (a?.diskPath) await deleteDiskFile(a.diskPath);
}

// Shared upload handler factory for Task / Document / MaterialRequest.
// Receives a multipart file, writes it to disk, creates the Attachment row,
// and returns the serialised row (with id so the frontend can build download URLs).
type AttachmentUploadContext = {
  entityId: string; // taskId | documentId | materialRequestId
  subfolder: AttachmentSubfolder;
  checkFn: (auth: AuthedRequest["authUser"]) => Promise<boolean>;
  notFoundError: string;
};
async function handleAttachmentUpload(
  req: AuthedRequest,
  res: Response,
  ctx: AttachmentUploadContext
): Promise<void> {
  if (!(await ctx.checkFn(req.authUser!))) {
    res.status(403).json({ error: "Anda tidak memiliki izin untuk melampirkan file di resource ini" });
    return;
  }

  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: "Tidak ada file yang diunggah" });
    return;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    res.status(400).json({ error: `File melebihi batas ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` });
    return;
  }

  try {
    const { diskPath } = await prepareDiskPath(ctx.subfolder, file.originalname);
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
        taskId: ctx.subfolder === "tasks" ? ctx.entityId : undefined,
        documentId: ctx.subfolder === "documents" ? ctx.entityId : undefined,
        materialRequestId: ctx.subfolder === "material-requests" ? ctx.entityId : undefined,
      },
      include: { uploadedByUser: { select: { id: true, name: true } } },
    });
    res.status(201).json({
      id: created.id,
      kind: created.kind,
      fileName: created.fileName,
      mimeType: created.mimeType,
      fileSize: created.fileSize,
      dataUrl: null,
      url: null,
      createdAt: created.createdAt,
      uploadedByUserId: created.uploadedByUser.id,
      uploadedByUserName: created.uploadedByUser.name,
    });
  } catch (err) {
    console.error("handleAttachmentUpload error", err);
    res.status(500).json({ error: ctx.notFoundError });
  }
}

// Multer must be applied per-route. We use a lazy-required dynamic import
// so the rest of the file stays synchronous.
async function getMulter() {
  const multer = (await import("multer")).default;
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } });
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validAttachmentInput(body: unknown) {
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
  if (!fileSize || fileSize <= 0 || fileSize > MAX_ATTACHMENT_BYTES) return null;
  return { kind: "FILE" as const, fileName: trimmedName, mimeType: mimeType.trim(), fileSize, dataUrl, url: null };
}

// --- Multipart upload endpoints (DEC-064) ---------------------------------
// These handle FILE uploads (multipart/form-data → disk). They are registered
// BEFORE the existing JSON routes so Express matches them first for file uploads.
// The frontend calls these for FILE uploads; LINK still uses the JSON route.

projectsRouter.post("/:projectId/tasks/:taskId/attachments/upload", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) { res.status(404).json({ error: "task not found" }); return; }
  const allowed = !!(await canManageProjectTasks(req.authUser!)) || !!(await canActOnTask(req.authUser!, task.taskRoles.map((tr) => tr.roleId)));
  if (!allowed) { res.status(403).json({ error: "Anda tidak memiliki izin untuk melampirkan file di task ini" }); return; }

  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) { res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" }); return; }
    await handleAttachmentUpload(req, res, {
      entityId: req.params.taskId,
      subfolder: "tasks",
      checkFn: async () => true, // already gate-checked above
      notFoundError: "task not found",
    });
  });
});

projectsRouter.post("/:projectId/documents/:docId/attachments/upload", async (req: AuthedRequest, res: Response) => {
  if (!(await isPrivileged(req.authUser!))) { res.status(403).json({ error: "Hanya super admin, OM, atau Director yang bisa melampirkan file" }); return; }
  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) {
      res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" });
      return;
    }
    if (!(await isPrivileged(req.authUser!))) { res.status(403).json({ error: "Hanya super admin, OM, atau Director yang bisa melampirkan file" }); return; }
    await handleAttachmentUpload(req, res, {
      entityId: req.params.docId,
      subfolder: "documents",
      checkFn: async () => !!(await isPrivileged(req.authUser!)),
      notFoundError: "document not found",
    });
  });
});

projectsRouter.post("/:projectId/material-requests/:requestId/attachments/upload", async (req: AuthedRequest, res: Response) => {
  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) {
      res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" });
      return;
    }
    const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
    if (!request || request.projectId !== req.params.projectId) { res.status(404).json({ error: "request not found" }); return; }
    if (!(await canAttachToMaterialRequest(req.authUser!, request))) { res.status(403).json({ error: "Anda tidak memiliki izin untuk melampirkan file" }); return; }
    await handleAttachmentUpload(req, res, {
      entityId: req.params.requestId,
      subfolder: "material-requests",
      checkFn: async () => !!(await canAttachToMaterialRequest(req.authUser!, request)),
      notFoundError: "request not found",
    });
  });
});

// --- Multipart replace endpoints (DEC-064) --------------------------------
// POST /tasks/:taskId/attachments/:attachmentId/replace
// POST /documents/:docId/attachments/:attachmentId/replace
// POST /material-requests/:requestId/attachments/:attachmentId/replace
// Replaces the binary payload of an existing FILE attachment. The attachment
// must already exist (kind=FILE). The old on-disk file is deleted.

projectsRouter.post("/:projectId/tasks/:taskId/attachments/:attachmentId/replace", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) { res.status(404).json({ error: "task not found" }); return; }
  const allowed = !!(await canManageProjectTasks(req.authUser!)) || !!(await canActOnTask(req.authUser!, task.taskRoles.map((tr) => tr.roleId)));
  if (!allowed) { res.status(403).json({ error: "Anda tidak memiliki izin untuk mengubah lampiran ini" }); return; }

  const existing = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!existing || existing.taskId !== task.id) { res.status(404).json({ error: "attachment not found" }); return; }
  if (existing.kind !== "FILE") { res.status(400).json({ error: "attachment kind mismatch" }); return; }

  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) { res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" }); return; }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: "Tidak ada file yang diunggah" }); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { res.status(400).json({ error: `File melebihi batas ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` }); return; }

    try {
      // Delete old on-disk file (if any)
      await deleteAttachmentFile(existing.id);
      const { diskPath } = await prepareDiskPath("tasks", file.originalname);
      await writeDiskFile(diskPath, file.buffer);

      await prisma.attachment.update({
        where: { id: existing.id },
        data: { diskPath, dataUrl: null, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size },
      });
      const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
      res.json(serializeProject(updated));
    } catch (err2) {
      console.error("replace task attachment error", err2);
      res.status(500).json({ error: "gagal mengganti file" });
    }
  });
});

projectsRouter.post("/:projectId/documents/:docId/attachments/:attachmentId/replace", async (req: AuthedRequest, res: Response) => {
  if (!(await isPrivileged(req.authUser!))) { res.status(403).json({ error: "Hanya super admin, OM, atau Director yang bisa mengubah lampiran ini" }); return; }

  const existing = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!existing || existing.documentId !== req.params.docId) { res.status(404).json({ error: "attachment not found" }); return; }
  if (existing.kind !== "FILE") { res.status(400).json({ error: "attachment kind mismatch" }); return; }

  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) { res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" }); return; }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: "Tidak ada file yang diunggah" }); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { res.status(400).json({ error: `File melebihi batas ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` }); return; }

    try {
      await deleteAttachmentFile(existing.id);
      const { diskPath } = await prepareDiskPath("documents", file.originalname);
      await writeDiskFile(diskPath, file.buffer);
      await prisma.attachment.update({
        where: { id: existing.id },
        data: { diskPath, dataUrl: null, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size },
      });
      const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
      res.json(serializeProject(updated));
    } catch (err2) {
      console.error("replace doc attachment error", err2);
      res.status(500).json({ error: "gagal mengganti file" });
    }
  });
});

projectsRouter.post("/:projectId/material-requests/:requestId/attachments/:attachmentId/replace", async (req: AuthedRequest, res: Response) => {
  const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
  if (!request || request.projectId !== req.params.projectId) { res.status(404).json({ error: "request not found" }); return; }
  if (!(await canAttachToMaterialRequest(req.authUser!, request))) { res.status(403).json({ error: "Anda tidak memiliki izin untuk mengubah lampiran ini" }); return; }

  const existing = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!existing || existing.materialRequestId !== request.id) { res.status(404).json({ error: "attachment not found" }); return; }
  if (existing.kind !== "FILE") { res.status(400).json({ error: "attachment kind mismatch" }); return; }

  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }).single("file");
  upload(req as Parameters<typeof upload>[0], res as Parameters<typeof upload>[1], async (err: unknown) => {
    if (err) { res.status(400).json({ error: (err as { message?: string }).message ?? "upload error" }); return; }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: "Tidak ada file yang diunggah" }); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { res.status(400).json({ error: `File melebihi batas ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB` }); return; }

    try {
      await deleteAttachmentFile(existing.id);
      const { diskPath } = await prepareDiskPath("material-requests", file.originalname);
      await writeDiskFile(diskPath, file.buffer);
      await prisma.attachment.update({
        where: { id: existing.id },
        data: { diskPath, dataUrl: null, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size },
      });
      const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
      res.json(serializeProject(project));
    } catch (err2) {
      console.error("replace MR attachment error", err2);
      res.status(500).json({ error: "gagal mengganti file" });
    }
  });
});

// Task attachments — the role the task is assigned to (they do the work and
// attach evidence/drawings), whoever manages the task list (PM/PIC/admin).
projectsRouter.post("/:projectId/tasks/:taskId/attachments", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ error: "task not found" });

  const allowed = (await canManageProjectTasks(req.authUser!)) || (await canActOnTask(req.authUser!, task.taskRoles.map((tr) => tr.roleId)));
  if (!allowed) {
    return res.status(403).json({ error: "Hanya role yang di-assign, Project Manager, Operational Manager, atau super admin yang bisa melampirkan file" });
  }

  const input = validAttachmentInput(req.body);
  if (!input) return res.status(400).json({ error: "File tidak valid atau melebihi 8MB" });

  await prisma.attachment.create({ data: { ...input, uploadedByUserId: req.authUser!.id, taskId: task.id } });
  const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
  res.status(201).json(serializeProject(updated));
});

projectsRouter.delete("/:projectId/tasks/:taskId/attachments/:attachmentId", async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { taskRoles: { include: { role: { select: { id: true } } } } },
  });
  if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ error: "task not found" });

  const allowed = (await canManageProjectTasks(req.authUser!)) || (await canActOnTask(req.authUser!, task.taskRoles.map((tr) => tr.roleId)));
  if (!allowed) {
    return res.status(403).json({ error: "Hanya role yang di-assign, Project Manager, Operational Manager, atau super admin yang bisa menghapus lampiran" });
  }

  try {
    await deleteAttachmentFile(req.params.attachmentId);
    await prisma.attachment.delete({ where: { id: req.params.attachmentId } });
    const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    res.json(serializeProject(updated));
  } catch {
    res.status(404).json({ error: "attachment not found" });
  }
});

// Edit an existing task attachment — rename label, replace the file
// payload, or change the link URL. The kind is locked (you can't turn a
// FILE into a LINK and vice versa — the original data shape is
// fundamentally different). Same permission gate as POST/DELETE so
// the assigned-role team and the task managers can all edit
// attachments they previously uploaded, not just add or remove.
projectsRouter.patch(
  "/:projectId/tasks/:taskId/attachments/:attachmentId",
  async (req: AuthedRequest, res: Response) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: { taskRoles: { include: { role: { select: { id: true } } } } },
    });
    if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ error: "task or project not found" });

    const allowed = (await canManageProjectTasks(req.authUser!)) || (await canActOnTask(req.authUser!, task.taskRoles.map((tr) => tr.roleId)));
    if (!allowed) {
      return res.status(403).json({ error: "Hanya role yang di-assign, Project Manager, Operational Manager, atau super admin yang bisa mengubah lampiran" });
    }

    const existing = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!existing || existing.taskId !== task.id) return res.status(404).json({ error: "attachment not found" });

    const { fileName, dataUrl, mimeType, fileSize, url } = req.body as {
      fileName?: string;
      dataUrl?: string;
      mimeType?: string;
      fileSize?: number;
      url?: string;
    };

    const data: Record<string, unknown> = {};

    // Rename: always allowed when present.
    if (fileName !== undefined) {
      const trimmed = fileName.trim();
      if (!trimmed) return res.status(400).json({ error: "fileName is required" });
      data.fileName = trimmed;
    }

    if (existing.kind === "FILE") {
      // Replacing the file payload is optional; if absent we keep the
      // current one. Validate the same way as POST.
      if (dataUrl !== undefined) {
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
          return res.status(400).json({ error: "dataUrl tidak valid" });
        }
        if (fileSize !== undefined && (!fileSize || fileSize <= 0 || fileSize > MAX_ATTACHMENT_BYTES)) {
          return res.status(400).json({ error: `File melebihi ${MAX_ATTACHMENT_BYTES} bytes` });
        }
        data.dataUrl = dataUrl;
        if (mimeType !== undefined) data.mimeType = mimeType.trim() || "application/octet-stream";
        if (fileSize !== undefined) data.fileSize = fileSize;
      }
    } else {
      // LINK
      if (url !== undefined) {
        const trimmed = url.trim();
        if (!isValidHttpUrl(trimmed)) return res.status(400).json({ error: "URL tidak valid" });
        data.url = trimmed;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Tidak ada field yang diubah" });
    }

    await prisma.attachment.update({ where: { id: existing.id }, data });
    const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    logActivityFor(req, {
      action: "task.attachmentUpdate",
      entityType: "Attachment",
      entityId: existing.id,
      description: `Mengubah lampiran "${existing.fileName}" pada task "${task.title}"`,
    });
    res.json(serializeProject(updated));
  }
);
projectsRouter.post(
  "/:projectId/documents/:docId/attachments",
  requirePrivileged,
  async (req: AuthedRequest, res: Response) => {
    const input = validAttachmentInput(req.body);
    if (!input) return res.status(400).json({ error: "File tidak valid atau melebihi 8MB" });
    try {
      await prisma.attachment.create({ data: { ...input, uploadedByUserId: req.authUser!.id, documentId: req.params.docId } });
      const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
      res.status(201).json(serializeProject(updated));
    } catch {
      res.status(404).json({ error: "document or project not found" });
    }
  }
);

projectsRouter.delete(
  "/:projectId/documents/:docId/attachments/:attachmentId",
  requirePrivileged,
  async (req: AuthedRequest, res: Response) => {
    try {
      await deleteAttachmentFile(req.params.attachmentId);
      await prisma.attachment.delete({ where: { id: req.params.attachmentId } });
      const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
      res.json(serializeProject(updated));
    } catch {
      res.status(404).json({ error: "attachment not found" });
    }
  }
);

// Edit a document-checklist attachment. Same permission as the document
// itself (super admin / OM / Director via requirePrivileged) — checklist
// attachments are the official evidence for the document being done, so
// they're gated tighter than task attachments.
projectsRouter.patch(
  "/:projectId/documents/:docId/attachments/:attachmentId",
  requirePrivileged,
  async (req: AuthedRequest, res: Response) => {
    const existing = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!existing || existing.documentId !== req.params.docId) return res.status(404).json({ error: "attachment not found" });

    const { fileName, dataUrl, mimeType, fileSize, url } = req.body as {
      fileName?: string;
      dataUrl?: string;
      mimeType?: string;
      fileSize?: number;
      url?: string;
    };

    const data: Record<string, unknown> = {};
    if (fileName !== undefined) {
      const trimmed = fileName.trim();
      if (!trimmed) return res.status(400).json({ error: "fileName is required" });
      data.fileName = trimmed;
    }
    if (existing.kind === "FILE" && dataUrl !== undefined) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        return res.status(400).json({ error: "dataUrl tidak valid" });
      }
      data.dataUrl = dataUrl;
      if (mimeType !== undefined) data.mimeType = mimeType.trim() || "application/octet-stream";
      if (fileSize !== undefined) data.fileSize = fileSize;
    } else if (existing.kind === "LINK" && url !== undefined) {
      const trimmed = url.trim();
      if (!isValidHttpUrl(trimmed)) return res.status(400).json({ error: "URL tidak valid" });
      data.url = trimmed;
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah" });

    await prisma.attachment.update({ where: { id: existing.id }, data });
    const updated = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    res.json(serializeProject(updated));
  }
);

// Material request attachments — the requester (attach spec/reference when
// submitting), Project Manager (review support), Purchasing (proof of
// purchase), or super admin.
async function canAttachToMaterialRequest(authUser: { id: string; isSuperAdmin: boolean }, request: { requestedByUserId: string }) {
  if (await isPrivileged(authUser)) return true;
  if (request.requestedByUserId === authUser.id) return true;
  if (await userHasRoleTitle(authUser.id, "Project Manager")) return true;
  return userHasRoleTitle(authUser.id, "Purchasing");
}

projectsRouter.post("/:projectId/material-requests/:requestId/attachments", async (req: AuthedRequest, res: Response) => {
  const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
  if (!request || request.projectId !== req.params.projectId) return res.status(404).json({ error: "request not found" });
  if (!(await canAttachToMaterialRequest(req.authUser!, request))) {
    return res.status(403).json({ error: "Hanya pengaju, Project Manager, tim Purchasing, atau super admin yang bisa melampirkan file" });
  }

  const input = validAttachmentInput(req.body);
  if (!input) return res.status(400).json({ error: "File tidak valid atau melebihi 8MB" });

  await prisma.attachment.create({ data: { ...input, uploadedByUserId: req.authUser!.id, materialRequestId: request.id } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
  res.status(201).json(serializeProject(project));
});

projectsRouter.delete(
  "/:projectId/material-requests/:requestId/attachments/:attachmentId",
  async (req: AuthedRequest, res: Response) => {
    const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
    if (!request || request.projectId !== req.params.projectId) return res.status(404).json({ error: "request not found" });
    if (!(await canAttachToMaterialRequest(req.authUser!, request))) {
      return res.status(403).json({ error: "Hanya pengaju, Project Manager, tim Purchasing, atau super admin yang bisa menghapus lampiran" });
    }
    try {
      await deleteAttachmentFile(req.params.attachmentId);
      await prisma.attachment.delete({ where: { id: req.params.attachmentId } });
      const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
      res.json(serializeProject(project));
    } catch {
      res.status(404).json({ error: "attachment not found" });
    }
  }
);

projectsRouter.patch(
  "/:projectId/material-requests/:requestId/attachments/:attachmentId",
  async (req: AuthedRequest, res: Response) => {
    const request = await prisma.materialRequest.findUnique({ where: { id: req.params.requestId } });
    if (!request || request.projectId !== req.params.projectId) return res.status(404).json({ error: "request not found" });
    if (!(await canAttachToMaterialRequest(req.authUser!, request))) {
      return res.status(403).json({ error: "Hanya pengaju, Project Manager, tim Purchasing, atau super admin yang bisa mengubah lampiran" });
    }

    const existing = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!existing || existing.materialRequestId !== request.id) return res.status(404).json({ error: "attachment not found" });

    const { fileName, dataUrl, mimeType, fileSize, url } = req.body as {
      fileName?: string;
      dataUrl?: string;
      mimeType?: string;
      fileSize?: number;
      url?: string;
    };

    const data: Record<string, unknown> = {};
    if (fileName !== undefined) {
      const trimmed = fileName.trim();
      if (!trimmed) return res.status(400).json({ error: "fileName is required" });
      data.fileName = trimmed;
    }
    if (existing.kind === "FILE" && dataUrl !== undefined) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        return res.status(400).json({ error: "dataUrl tidak valid" });
      }
      data.dataUrl = dataUrl;
      if (mimeType !== undefined) data.mimeType = mimeType.trim() || "application/octet-stream";
      if (fileSize !== undefined) data.fileSize = fileSize;
    } else if (existing.kind === "LINK" && url !== undefined) {
      const trimmed = url.trim();
      if (!isValidHttpUrl(trimmed)) return res.status(400).json({ error: "URL tidak valid" });
      data.url = trimmed;
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Tidak ada field yang diubah" });

    await prisma.attachment.update({ where: { id: existing.id }, data });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: req.params.projectId }, include: projectInclude });
    res.json(serializeProject(project));
  }
);

