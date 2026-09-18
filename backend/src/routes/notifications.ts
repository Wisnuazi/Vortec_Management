import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, getUserRoles, userHasAnyRoleTitle, userHasRoleTitle, type AuthedRequest } from "../auth";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const TASK_LOOKAHEAD_DAYS = 3;
const PROJECT_LOOKAHEAD_DAYS = 7;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Same Operational Manager/Director gate as operational.ts's
// canReviewKasbon — duplicated here (not exported from that router) since
// it's the only piece of that file this route needs. Director added per
// DEC-051.
async function canReviewKasbon(authUser: { id: string; isSuperAdmin: boolean }) {
  if (authUser.isSuperAdmin) return true;
  if (await userHasRoleTitle(authUser.id, "Operational Manager")) return true;
  return userHasRoleTitle(authUser.id, "Director");
}

// Notifications are split into two domains — "project" (tasks/projects due
// dates, plus task and material-request approvals) and "operational"
// (Kasbon phases awaiting the Operational Manager's review, or rejected
// phases the requester needs to revise) — per explicit user request
// ("pisahkan notifikasi, ada notif Project dan operasional"). Approval
// items are now real notification entries in their respective domain, not
// only a count banner linking out to /approvals ("approval itu harus
// masuk notif juga"). Personalization is unchanged from DEC-027: super
// admin sees everything; everyone else sees only their own role-assigned
// tasks, projects they have a stake in, and approvals they're actually
// responsible for. Director added per DEC-051 (full oversight — sees all
// projects, all approval queues, all kasbon).
notificationsRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const isSuperAdmin = req.authUser!.isSuperAdmin;
  const roleIds = isSuperAdmin ? null : new Set((await getUserRoles(req.authUser!.id)).map((r) => r.id));
  const isProjectManager = isSuperAdmin || (await userHasRoleTitle(req.authUser!.id, "Project Manager"));
  const isOperationalManager = isSuperAdmin || (await userHasRoleTitle(req.authUser!.id, "Operational Manager"));
  const isDirector = isSuperAdmin || (await userHasRoleTitle(req.authUser!.id, "Director"));
  const seesAllProjects = isSuperAdmin || isProjectManager || isOperationalManager || isDirector;
  const canReviewKasbonPhases = await canReviewKasbon(req.authUser!);
  const canReviewMaterialRequests = isSuperAdmin || isProjectManager || isOperationalManager || isDirector;

  // --- Project domain: due-date reminders -----------------------------
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { not: null, lte: daysFromNow(TASK_LOOKAHEAD_DAYS) },
      status: { notIn: ["DONE", "REJECTED"] },
    },
    orderBy: { dueDate: "asc" },
    include: { project: { select: { id: true, name: true } }, taskRoles: { include: { role: { select: { id: true, title: true } } } } },
  });
  const visibleTasks = isSuperAdmin ? tasks : tasks.filter((t) => t.taskRoles.some((tr) => roleIds!.has(tr.roleId)));

  const projects = await prisma.project.findMany({
    where: {
      targetDate: { not: null, lte: daysFromNow(PROJECT_LOOKAHEAD_DAYS) },
      stage: { notIn: ["RELEASED", "REJECTED", "ON_HOLD"] },
      ...(seesAllProjects ? {} : { picUserId: req.authUser!.id }),
    },
    orderBy: { targetDate: "asc" },
  });

  const now = new Date();
  const taskItems = visibleTasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    overdue: t.dueDate! < now,
    assignedRoleTitles: t.taskRoles.map((tr) => tr.role.title),
    projectId: t.project.id,
    projectName: t.project.name,
  }));
  const projectItems = projects.map((p) => ({
    id: p.id,
    name: p.name,
    targetDate: p.targetDate,
    overdue: p.targetDate! < now,
    stage: p.stage,
  }));

  // --- Project domain: approvals ---------------------------------------
  const approvalTasksRaw = await prisma.task.findMany({
    where: { requiresApproval: true, status: "WAITING_APPROVAL" },
    orderBy: { dueDate: "asc" },
    include: { project: { select: { id: true, name: true } }, taskRoles: { include: { role: { select: { id: true, title: true } } } } },
  });
  const visibleApprovalTasks = isSuperAdmin
    ? approvalTasksRaw
    : approvalTasksRaw.filter((t) => t.taskRoles.some((tr) => roleIds!.has(tr.roleId)));

  const materialRequestApprovalsRaw = canReviewMaterialRequests
    ? await prisma.materialRequest.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { createdAt: "asc" },
        include: { project: { select: { id: true, name: true } }, requestedByUser: { select: { id: true, name: true } } },
      })
    : [];

  const taskApprovalItems = visibleApprovalTasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    assignedRoleTitles: t.taskRoles.map((tr) => tr.role.title),
    projectId: t.project.id,
    projectName: t.project.name,
  }));
  const materialRequestApprovalItems = materialRequestApprovalsRaw.map((r) => ({
    id: r.id,
    title: r.title,
    projectId: r.project.id,
    projectName: r.project.name,
    requestedByUserName: r.requestedByUser.name,
    createdAt: r.createdAt,
  }));

  // --- Operational domain: Kasbon submissions needing attention ----------
  // DEC-061: the old "Kasbon phase" model (one phase = one batch with a
  // SUBMITTED/REJECTED status) is replaced by KasbonSubmission (a batch
  // of items under a phase). OM reviews the submission; OL gets a
  // "needs new submission" hint when one of their submissions was
  // REJECTED, and an "approved" hint when their submission is APPROVED
  // (so they know to go realise the items).
  const kasbonPendingReviewRaw = canReviewKasbonPhases
    ? await prisma.kasbonSubmission.findMany({
        where: { status: "PENDING" },
        orderBy: { submittedAt: "asc" },
        include: {
          submittedByUser: { select: { id: true, name: true } },
          phase: { select: { division: true, period: true, phase: true } },
        },
      })
    : [];
  const kasbonNeedsRevisionRaw = await prisma.kasbonSubmission.findMany({
    where: { status: "REJECTED", submittedByUserId: req.authUser!.id },
    orderBy: { reviewedAt: "asc" },
    include: {
      submittedByUser: { select: { id: true, name: true } },
      phase: { select: { division: true, period: true, phase: true } },
    },
  });
  // "Approved" hint — show to the submitter so they go realise the
  // items. The phase could still be OPEN with multiple submissions; we
  // only show the most recent APPROVED one per user to avoid noise.
  const kasbonApprovedRaw = await prisma.kasbonSubmission.findMany({
    where: { status: "APPROVED", submittedByUserId: req.authUser!.id },
    orderBy: { reviewedAt: "desc" },
    take: 5,
    include: {
      submittedByUser: { select: { id: true, name: true } },
      phase: { select: { division: true, period: true, phase: true } },
    },
  });

  const kasbonSubmissionItem = (s: (typeof kasbonPendingReviewRaw)[number]) => ({
    id: s.id,
    division: s.phase.division,
    period: s.phase.period,
    phase: s.phase.phase,
    submittedByUserName: s.submittedByUser.name,
    submittedAt: s.submittedAt,
    reviewedAt: s.reviewedAt,
    reviewNote: s.reviewNote,
  });
  const kasbonPendingReviewItems = kasbonPendingReviewRaw.map(kasbonSubmissionItem);
  const kasbonNeedsRevisionItems = kasbonNeedsRevisionRaw.map(kasbonSubmissionItem);
  const kasbonApprovedItems = kasbonApprovedRaw.map(kasbonSubmissionItem);

  // --- BOM domain (DEC-063) ------------------------------------------
  // Notifications are derived from the BomItem status, not stored:
  // - bomPendingReview: items in SUBMITTED status, surfaced to PM/OM
  //   (and not the actor who already saw the create toast)
  // - bomRejected: items in REJECTED status, surfaced to the
  //   submitter so they know to fix and re-submit
  // - bomApprovedNeedsPurchase: items in APPROVED status, surfaced
  //   to the Purchasing team as a "new item in your queue" hint
  // - bomProcessing: items in PROCESSING status, surfaced to the
  //   submitter (informational — your item is being bought)
  // - bomArrived: items in ARRIVED status, surfaced to the
  //   submitter (informational — your item landed)
  // The role checks (canReviewBom / canProcessBom) reuse the same
  // backend helpers DEC-062 used to gate the per-route writes, so
  // the notif surface stays consistent with who can do what.
  const canReviewBomItems =
    req.authUser!.isSuperAdmin ||
    (await userHasAnyRoleTitle(req.authUser!.id, ["Project Manager", "Operational Manager"]));
  const canProcessBomItems = req.authUser!.isSuperAdmin ||
    (await userHasRoleTitle(req.authUser!.id, "Purchasing"));

  const bomItemIncludeForNotif = {
    project: { select: { id: true, name: true } },
    submittedByUser: { select: { id: true, name: true } },
    approvedByUser: { select: { id: true, name: true } },
    processedByUser: { select: { id: true, name: true } },
  };

  const bomPendingReviewRaw = canReviewBomItems
    ? await prisma.bomItem.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { submittedAt: "asc" },
        include: bomItemIncludeForNotif,
      })
    : [];
  const bomRejectedRaw = await prisma.bomItem.findMany({
    where: { status: "REJECTED", submittedByUserId: req.authUser!.id },
    orderBy: { submittedAt: "desc" },
    take: 5,
    include: bomItemIncludeForNotif,
  });
  const bomApprovedNeedsPurchaseRaw = canProcessBomItems
    ? await prisma.bomItem.findMany({
        where: { status: "APPROVED" },
        orderBy: { approvedAt: "asc" },
        include: bomItemIncludeForNotif,
      })
    : [];
  const bomProcessingRaw = await prisma.bomItem.findMany({
    where: { status: "PROCESSING", submittedByUserId: req.authUser!.id },
    orderBy: { purchasingUpdatedAt: "desc" },
    take: 5,
    include: bomItemIncludeForNotif,
  });
  const bomArrivedRaw = await prisma.bomItem.findMany({
    where: { status: "ARRIVED", submittedByUserId: req.authUser!.id },
    orderBy: { purchasingUpdatedAt: "desc" },
    take: 5,
    include: bomItemIncludeForNotif,
  });

  const bomNotifItem = (i: (typeof bomPendingReviewRaw)[number]) => ({
    id: i.id,
    projectId: i.project.id,
    projectName: i.project.name,
    bomType: i.bomType,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    status: i.status,
    submittedByUserName: i.submittedByUser.name,
    approvedByUserName: i.approvedByUser?.name ?? null,
    processedByUserName: i.processedByUser?.name ?? null,
    submittedAt: i.submittedAt,
    approvedAt: i.approvedAt,
    purchasingUpdatedAt: i.purchasingUpdatedAt,
    approveNote: i.approveNote,
  });
  const bomPendingReviewItems = bomPendingReviewRaw.map(bomNotifItem);
  const bomRejectedItems = bomRejectedRaw.map(bomNotifItem);
  const bomApprovedNeedsPurchaseItems = bomApprovedNeedsPurchaseRaw.map(bomNotifItem);
  const bomProcessingItems = bomProcessingRaw.map(bomNotifItem);
  const bomArrivedItems = bomArrivedRaw.map(bomNotifItem);

  // NOTE: bomPendingReviewItems are excluded here. BOM review is part of the
  // BOM/Purchasing workflow (not the generic "Approval" menu). Including them
  // here would inflate the count with items that don't appear in /approvals.
  // BOM visibility is still served in the /notifications response under
  // data.bom so users can see it in the Notifications page.
  const pendingApprovalsCount =
    taskApprovalItems.length +
    materialRequestApprovalItems.length +
    kasbonPendingReviewItems.length;
  const bomNotifCount =
    bomPendingReviewItems.length +
    bomRejectedItems.length +
    bomApprovedNeedsPurchaseItems.length +
    bomProcessingItems.length +
    bomArrivedItems.length;

  res.json({
    project: {
      overdueTasks: taskItems.filter((t) => t.overdue),
      upcomingTasks: taskItems.filter((t) => !t.overdue),
      overdueProjects: projectItems.filter((p) => p.overdue),
      upcomingProjects: projectItems.filter((p) => !p.overdue),
      taskApprovals: taskApprovalItems,
      materialRequestApprovals: materialRequestApprovalItems,
    },
    operational: {
      kasbonPendingReview: kasbonPendingReviewItems,
      kasbonNeedsRevision: kasbonNeedsRevisionItems,
      kasbonApproved: kasbonApprovedItems,
    },
    bom: {
      pendingReview: bomPendingReviewItems,
      rejected: bomRejectedItems,
      approvedNeedsPurchase: bomApprovedNeedsPurchaseItems,
      processing: bomProcessingItems,
      arrived: bomArrivedItems,
    },
    pendingApprovalsCount,
    bomNotifCount,
  });
});
