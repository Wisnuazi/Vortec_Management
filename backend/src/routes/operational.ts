import { Router, type Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../prisma";
import { requireAuth, userHasRoleTitle, isPrivileged, type AuthedRequest } from "../auth";
import { logActivityFor } from "../activityLog";

export const operationalRouter = Router();
operationalRouter.use(requireAuth);

// Everyone except Project Manager can access this menu — PM's day-to-day
// already lives entirely in Projects/Tasks/BOM. Applies to every route
// below. See DEC-041; Director added per DEC-051 (full oversight).
async function canAccessOperational(authUser: { id: string; isSuperAdmin: boolean }) {
  if (authUser.isSuperAdmin) return true;
  if (await isPrivileged(authUser)) return true;
  return !(await userHasRoleTitle(authUser.id, "Project Manager"));
}
operationalRouter.use(async (req: AuthedRequest, res: Response, next: () => void) => {
  if (await canAccessOperational(req.authUser!)) return next();
  res.status(403).json({ error: "Menu Operasional tidak tersedia untuk Project Manager" });
});

// Operational Manager/Operational Leader/Director (or super admin) monitor
// everyone's daily reports and kasbon phases; everyone else only sees
// their own. Director added per DEC-051.
async function canMonitorOperational(authUser: { id: string; isSuperAdmin: boolean }) {
  if (await isPrivileged(authUser)) return true;
  return userHasRoleTitle(authUser.id, "Operational Leader");
}

async function canReviewKasbon(authUser: { id: string; isSuperAdmin: boolean }) {
  if (await isPrivileged(authUser)) return true;
  return userHasRoleTitle(authUser.id, "Operational Manager");
}

// Kasbon itself is narrower than the rest of the Operasional menu: only
// Operational Manager and Operational Leader (or super admin) — everyone
// else who can otherwise access this menu (e.g. Mechanical Engineer,
// BusDev) can still use Daily Report, but not Kasbon. In practice the
// Operational Leader requests/itemizes kasbon and the Operational Manager
// reviews/approves it (canReviewKasbon above). Scoped to the /kasbon
// prefix only — Daily Report keeps the broader canAccessOperational gate.
operationalRouter.use("/kasbon", async (req: AuthedRequest, res: Response, next: () => void) => {
  if (await canMonitorOperational(req.authUser!)) return next();
  res.status(403).json({ error: "Kasbon hanya tersedia untuk Operational Manager dan Operational Leader" });
});

// --- Daily Report ----------------------------------------------------------

function serializeDailyReport(r: {
  id: string;
  userId: string;
  user: { name: string };
  date: Date;
  activities: string;
  createdAt: Date;
  updatedAt: Date;
  attachments?: {
    id: string;
    kind: "FILE" | "LINK";
    fileName: string;
    mimeType: string;
    fileSize: number;
    dataUrl: string | null;
    url: string | null;
    createdAt: Date;
  }[];
}) {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    date: r.date,
    activities: r.activities,
    // The attachment list is included in every read path. dataUrl stays
    // on the row (the same base64 pattern as the Task/Doc/MR attachment
    // surfaces — see DEC-055/057 for the storage trade-off rationale).
    attachments: (r.attachments ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      dataUrl: a.dataUrl,
      url: a.url,
      createdAt: a.createdAt,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

operationalRouter.get("/daily-reports", async (req: AuthedRequest, res: Response) => {
  const monitor = await canMonitorOperational(req.authUser!);
  const reports = await prisma.dailyReport.findMany({
    where: monitor ? {} : { userId: req.authUser!.id },
    orderBy: { date: "desc" },
    include: {
      user: { select: { name: true } },
      attachments: { orderBy: { createdAt: "asc" as const } },
    },
  });
  res.json(reports.map(serializeDailyReport));
});

operationalRouter.post("/daily-reports", async (req: AuthedRequest, res: Response) => {
  const { date, activities } = req.body as { date?: string; activities?: string };
  const trimmed = activities?.trim();
  if (!date || !trimmed) return res.status(400).json({ error: "date and activities are required" });

  const report = await prisma.dailyReport.create({
    data: { userId: req.authUser!.id, date: new Date(date), activities: trimmed },
    include: { user: { select: { name: true } }, attachments: true },
  });
  logActivityFor(req, {
    action: "dailyReport.create",
    entityType: "DailyReport",
    entityId: report.id,
    description: `Mengisi daily report tanggal ${report.date.toISOString().slice(0, 10)}`,
  });
  res.status(201).json(serializeDailyReport(report));
});

operationalRouter.patch("/daily-reports/:id", async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.dailyReport.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "report not found" });
  if (existing.userId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pemilik daily report atau super admin yang bisa mengubahnya" });
  }

  const { date, activities } = req.body as { date?: string; activities?: string };
  const report = await prisma.dailyReport.update({
    where: { id: req.params.id },
    data: {
      ...(date !== undefined ? { date: new Date(date) } : {}),
      ...(activities !== undefined ? { activities: activities.trim() } : {}),
    },
    include: { user: { select: { name: true } }, attachments: true },
  });
  logActivityFor(req, {
    action: "dailyReport.update",
    entityType: "DailyReport",
    entityId: report.id,
    description: `Mengubah daily report tanggal ${report.date.toISOString().slice(0, 10)}`,
  });
  res.json(serializeDailyReport(report));
});

operationalRouter.delete("/daily-reports/:id", async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.dailyReport.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "report not found" });
  if (existing.userId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pemilik daily report atau super admin yang bisa menghapusnya" });
  }

  await prisma.dailyReport.delete({ where: { id: req.params.id } });
  logActivityFor(req, {
    action: "dailyReport.delete",
    entityType: "DailyReport",
    entityId: req.params.id,
    description: `Menghapus daily report tanggal ${existing.date.toISOString().slice(0, 10)}`,
  });
  res.status(204).end();
});

// --- Daily Report attachments ---------------------------------------------
// Same shape and permission rules as the report itself: only the
// report owner (or super admin) can add/edit/delete attachments. The
// owner-gate matches the existing PATCH/DELETE on /daily-reports/:id.
//
// Attachment is a base64 dataUrl for FILE, or an external URL for
// LINK. Mirrors the Task / Document / MaterialRequest attachment
// routes (the Attachment row carries exactly one of the four FKs).
// See DEC-060.
const MAX_DAILY_REPORT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function validDailyReportAttachment(body: unknown): {
  kind: "FILE" | "LINK";
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
} | null {
  const { kind, fileName, mimeType, fileSize, dataUrl, url } = (body ?? {}) as {
    kind?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    dataUrl?: string;
    url?: string;
  };
  const trimmed = fileName?.trim();
  if (!trimmed) return null;

  if (kind === "LINK") {
    const u = url?.trim();
    if (!u) return null;
    // Match the same regex used by the task attachment route — see DEC-055.
    if (!/^https?:\/\/\S+$/i.test(u)) return null;
    return { kind: "LINK", fileName: trimmed, mimeType: "", fileSize: 0, dataUrl: null, url: u };
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  if (typeof fileSize !== "number" || fileSize <= 0 || fileSize > MAX_DAILY_REPORT_ATTACHMENT_BYTES) return null;
  return {
    kind: "FILE",
    fileName: trimmed,
    mimeType: mimeType?.trim() || "application/octet-stream",
    fileSize,
    dataUrl,
    url: null,
  };
}

operationalRouter.post("/daily-reports/:id/attachments", async (req: AuthedRequest, res: Response) => {
  const report = await prisma.dailyReport.findUnique({ where: { id: req.params.id } });
  if (!report) return res.status(404).json({ error: "report not found" });
  if (report.userId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pemilik daily report atau super admin yang bisa menambahkan lampiran" });
  }

  const attachment = validDailyReportAttachment(req.body);
  if (!attachment) return res.status(400).json({ error: "Attachment tidak valid atau melebihi 8MB" });

  const created = await prisma.attachment.create({
    data: {
      ...attachment,
      uploadedByUserId: req.authUser!.id,
      dailyReportId: report.id,
    },
  });
  res.status(201).json({
    id: created.id,
    kind: created.kind,
    fileName: created.fileName,
    mimeType: created.mimeType,
    fileSize: created.fileSize,
    dataUrl: created.dataUrl,
    url: created.url,
    createdAt: created.createdAt,
  });
});

operationalRouter.delete(
  "/daily-reports/:id/attachments/:attachmentId",
  async (req: AuthedRequest, res: Response) => {
    const report = await prisma.dailyReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: "report not found" });
    if (report.userId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
      return res.status(403).json({ error: "Hanya pemilik daily report atau super admin yang bisa menghapus lampiran" });
    }

    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!attachment || attachment.dailyReportId !== report.id) {
      return res.status(404).json({ error: "attachment not found in this report" });
    }
    await prisma.attachment.delete({ where: { id: attachment.id } });
    res.status(204).end();
  }
);

// --- Kasbon (phase + multi-submission) ---------------------------------------
// Redesigned per DEC-061. The old model (one phase = one submission batch,
// edit+resubmit on reject) is replaced with:
//   - KasbonPhase: spending round created by OM, status OPEN|REALIZED.
//     Auto-flips to REALIZED when every item in every APPROVED submission
//     has full realisation data (link, dates, both photos).
//   - KasbonSubmission: a batch of items OL sends to OM. Status
//     PENDING|APPROVED|REJECTED. After approval OL fills realisation per
//     item. After rejection OL must create a NEW submission (the old one
//     stays visible read-only as audit trail).
//   - KasbonItem: lives under a submission. At submit time the OL only
//     fills reason/item/qty/unit/price. Realisation data
//     (link, purchaseDate, receivedDate, receiptPhotoUrl, itemPhotoUrl)
//     is filled AFTER approval via a dedicated PATCH .../realize route.
// The KASBON_MAX_AMOUNT cap (Rp 5,000,000 per phase) still applies
// across all APPROVED items in the phase (DEC-043).

const KASBON_REASONS = ["DEVELOPMENT", "PRODUCTION", "OPERATION", "TOOLS_ASSET"] as const;
type KasbonReason = (typeof KASBON_REASONS)[number];
const PERIOD_RE = /^\d{4}-\d{2}$/;
const KASBON_MAX_AMOUNT = 5_000_000;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const KASBON_DIVISION = "Operational";

function validPhotoInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !value.startsWith("data:image/")) throw new Error("invalid photo");
  const base64Length = value.length - value.indexOf(",") - 1;
  const approxBytes = base64Length * 0.75;
  if (approxBytes > MAX_PHOTO_BYTES) throw new Error("photo too large");
  return value;
}

const submissionInclude = {
  submittedByUser: { select: { id: true, name: true } },
  reviewedByUser: { select: { id: true, name: true } },
  items: { orderBy: { createdAt: "asc" as const } },
};

const phaseInclude = {
  createdByUser: { select: { id: true, name: true } },
  submissions: { include: submissionInclude, orderBy: { submittedAt: "asc" as const } },
};

type KasbonItemRow = {
  id: string;
  reason: string;
  item: string;
  qty: number;
  unit: string;
  price: number;
  link: string;
  purchaseDate: Date | null;
  receivedDate: Date | null;
  receiptPhotoUrl: string | null;
  itemPhotoUrl: string | null;
};

type KasbonSubmissionRow = {
  id: string;
  status: string;
  batchNote: string;
  submittedByUser: { id: string; name: string };
  submittedAt: Date;
  reviewedByUser: { id: string; name: string } | null;
  reviewedAt: Date | null;
  reviewNote: string;
  items: KasbonItemRow[];
};

type KasbonPhaseRow = {
  id: string;
  division: string;
  period: string;
  phase: number;
  status: string;
  realizedAt: Date | null;
  createdByUser: { id: string; name: string };
  submissions: KasbonSubmissionRow[];
  createdAt: Date;
};

function itemIsRealized(i: KasbonItemRow): boolean {
  return !!i.link.trim() && !!i.purchaseDate && !!i.receivedDate && !!i.receiptPhotoUrl && !!i.itemPhotoUrl;
}

function serializeItem(i: KasbonItemRow) {
  return {
    id: i.id,
    reason: i.reason,
    item: i.item,
    qty: i.qty,
    unit: i.unit,
    price: i.price,
    link: i.link,
    purchaseDate: i.purchaseDate,
    receivedDate: i.receivedDate,
    receiptPhotoUrl: i.receiptPhotoUrl,
    itemPhotoUrl: i.itemPhotoUrl,
    realized: itemIsRealized(i),
  };
}

function serializeSubmission(s: KasbonSubmissionRow) {
  const total = s.items.reduce((sum, i) => sum + i.qty * i.price, 0);
  return {
    id: s.id,
    status: s.status,
    batchNote: s.batchNote,
    items: s.items.map(serializeItem),
    total,
    submittedByUserId: s.submittedByUser.id,
    submittedByUserName: s.submittedByUser.name,
    submittedAt: s.submittedAt,
    reviewedByUserName: s.reviewedByUser?.name ?? null,
    reviewedAt: s.reviewedAt,
    reviewNote: s.reviewNote,
  };
}

function serializePhase(p: KasbonPhaseRow) {
  // Total = sum across APPROVED items only (PENDING submissions are not
  // committed budget; REJECTED submissions were declined). This matches
  // the user's "setelah approve, OL isi realisation" flow where the
  // phase's cap is the committed amount, not the requested amount.
  const total = p.submissions
    .filter((s) => s.status === "APPROVED")
    .flatMap((s) => s.items)
    .reduce((sum, i) => sum + i.qty * i.price, 0);
  return {
    id: p.id,
    division: p.division,
    period: p.period,
    phase: p.phase,
    status: p.status,
    realizedAt: p.realizedAt,
    createdByUserId: p.createdByUser.id,
    createdByUserName: p.createdByUser.name,
    submissions: p.submissions.map(serializeSubmission),
    total,
    remaining: KASBON_MAX_AMOUNT - total,
    createdAt: p.createdAt,
  };
}

// Re-check and possibly flip a phase to REALIZED. Called after any
// item-level mutation in an APPROVED submission. Returns the updated
// phase (or the input phase if no change).
async function maybeRealizePhase(phaseId: string) {
  const phase = await prisma.kasbonPhase.findUnique({
    where: { id: phaseId },
    include: { submissions: { include: { items: true } } },
  });
  if (!phase || phase.status !== "OPEN") return phase;
  const approvedItems = phase.submissions.filter((s) => s.status === "APPROVED").flatMap((s) => s.items);
  if (approvedItems.length === 0) return phase; // no approved items yet
  const allRealized = approvedItems.every(itemIsRealized);
  if (!allRealized) return phase;
  return prisma.kasbonPhase.update({
    where: { id: phaseId },
    data: { status: "REALIZED", realizedAt: new Date() },
    include: phaseInclude,
  });
}

// ----- Phase endpoints ----------------------------------------------------

operationalRouter.get("/kasbon/phases", async (req: AuthedRequest, res: Response) => {
  // Anyone with kasbon access sees all phases (every OL/OM needs to see
  // the open phase to submit / review against it). The narrower
  // "own submissions only" filter that the old model had doesn't
  // translate to the new model — there are no "owned" phases anymore,
  // only owned submissions inside a shared phase.
  const phases = await prisma.kasbonPhase.findMany({
    orderBy: [{ period: "desc" }, { phase: "desc" }],
    include: phaseInclude,
  });
  res.json(phases.map(serializePhase));
});

operationalRouter.post("/kasbon/phases", async (req: AuthedRequest, res: Response) => {
  if (!(await canReviewKasbon(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Operational Manager atau super admin yang bisa membuka fase kasbon baru" });
  }
  const { period } = req.body as { period?: string };
  if (!period || !PERIOD_RE.test(period)) return res.status(400).json({ error: "period must be in YYYY-MM format" });

  // No two OPEN phases for the same (division, period) — block if one
  // already exists.
  const existingOpen = await prisma.kasbonPhase.findFirst({
    where: { division: KASBON_DIVISION, period, status: "OPEN" },
  });
  if (existingOpen) {
    return res.status(400).json({ error: "Masih ada fase OPEN untuk periode ini — selesaikan dulu sebelum membuka fase baru" });
  }
  // OM can only create a new phase when every previous phase in the
  // same division is REALIZED. The user-stated rule was "OM baru bisa
  // membuat Fase baru ketika fase sebelumnya sudah realisasi" — so we
  // scan all phases for this division in period order and check the
  // most recent one is REALIZED.
  const lastPhase = await prisma.kasbonPhase.findFirst({
    where: { division: KASBON_DIVISION },
    orderBy: [{ period: "desc" }, { phase: "desc" }],
  });
  if (lastPhase && lastPhase.status !== "REALIZED") {
    return res.status(400).json({
      error: "Fase kasbon sebelumnya belum direalisasikan — selesaikan realisasinya dulu sebelum membuat fase baru",
    });
  }
  // Auto-number the phase: max(phase)+1 for this (division, period).
  const periodPhases = await prisma.kasbonPhase.findMany({
    where: { division: KASBON_DIVISION, period },
    select: { phase: true },
  });
  const nextPhase = periodPhases.length === 0 ? 1 : Math.max(...periodPhases.map((p) => p.phase)) + 1;

  const created = await prisma.kasbonPhase.create({
    data: { division: KASBON_DIVISION, period, phase: nextPhase, createdByUserId: req.authUser!.id },
    include: phaseInclude,
  });
  logActivityFor(req, {
    action: "kasbonPhase.create",
    entityType: "KasbonPhase",
    entityId: created.id,
    description: `Membuka fase kasbon ${KASBON_DIVISION} ${period} Phase ${nextPhase}`,
  });
  res.status(201).json(serializePhase(created));
});

operationalRouter.delete("/kasbon/phases/:id", async (req: AuthedRequest, res: Response) => {
  if (!(await canReviewKasbon(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Operational Manager atau super admin yang bisa menghapus fase" });
  }
  const phase = await prisma.kasbonPhase.findUnique({
    where: { id: req.params.id },
    include: { submissions: { include: { items: true } } },
  });
  if (!phase) return res.status(404).json({ error: "phase not found" });
  const hasAnyItems = phase.submissions.some((s) => s.items.length > 0);
  if (hasAnyItems) {
    return res.status(400).json({ error: "Fase yang sudah memiliki item tidak bisa dihapus" });
  }
  await prisma.kasbonPhase.delete({ where: { id: req.params.id } });
  logActivityFor(req, {
    action: "kasbonPhase.delete",
    entityType: "KasbonPhase",
    entityId: req.params.id,
    description: `Menghapus fase kasbon ${phase.division} ${phase.period} Phase ${phase.phase}`,
  });
  res.status(204).end();
});

// ----- Submission endpoints -----------------------------------------------

// Create a new PENDING submission in a phase. OL only (the requester
// of the new model). The phase must be OPEN, and the OL must not
// already have a PENDING submission in this phase (to avoid parallel
// drafts). If a previous submission was REJECTED, OL can create a new
// one — this is the explicit "harus mengajukan pengajuan baru" path.
operationalRouter.post("/kasbon/phases/:id/submissions", async (req: AuthedRequest, res: Response) => {
  const phase = await prisma.kasbonPhase.findUnique({
    where: { id: req.params.id },
    include: { submissions: true },
  });
  if (!phase) return res.status(404).json({ error: "phase not found" });
  if (phase.status !== "OPEN") {
    return res.status(400).json({ error: "Fase ini sudah tidak menerima pengajuan baru" });
  }
  const myPending = phase.submissions.find(
    (s) => s.submittedByUserId === req.authUser!.id && s.status === "PENDING"
  );
  if (myPending) {
    return res.status(400).json({ error: "Anda masih punya pengajuan PENDING pada fase ini — selesaikan dulu" });
  }
  const { batchNote } = req.body as { batchNote?: string };
  const created = await prisma.kasbonSubmission.create({
    data: {
      phaseId: phase.id,
      submittedByUserId: req.authUser!.id,
      batchNote: batchNote?.trim() ?? "",
    },
    include: submissionInclude,
  });
  logActivityFor(req, {
    action: "kasbonSubmission.create",
    entityType: "KasbonSubmission",
    entityId: created.id,
    description: `Membuat pengajuan kasbon pada fase ${phase.division} ${phase.period} Phase ${phase.phase}`,
  });
  // Re-fetch the phase so the response includes all submissions.
  const updated = await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: phase.id }, include: phaseInclude });
  res.status(201).json(serializePhase(updated));
});

// Add an item to a PENDING submission. Only the submission's owner can
// add items, and only while the submission is PENDING.
operationalRouter.post("/kasbon/submissions/:id/items", async (req: AuthedRequest, res: Response) => {
  const submission = await prisma.kasbonSubmission.findUnique({
    where: { id: req.params.id },
    include: { items: true, phase: true },
  });
  if (!submission) return res.status(404).json({ error: "submission not found" });
  if (submission.submittedByUserId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pengaju yang bisa menambah item" });
  }
  if (submission.status !== "PENDING") {
    return res.status(400).json({ error: "Pengajuan ini sudah dikunci (bukan PENDING)" });
  }

  const { reason, item, qty, unit, price } = req.body as {
    reason?: string;
    item?: string;
    qty?: number;
    unit?: string;
    price?: number;
  };
  const trimmedItem = item?.trim();
  if (!reason || !KASBON_REASONS.includes(reason as KasbonReason)) return res.status(400).json({ error: "invalid reason" });
  if (!trimmedItem || !qty || qty <= 0 || !unit?.trim() || price === undefined || price < 0) {
    return res.status(400).json({ error: "reason, item, qty (>0), unit, and price (>=0) are required" });
  }

  // Per-phase cap: sum of qty*price across APPROVED items in this
  // phase + the new item must not exceed KASBON_MAX_AMOUNT. PENDING /
  // REJECTED items don't count toward the cap (they're not committed).
  const phase = await prisma.kasbonPhase.findUniqueOrThrow({
    where: { id: submission.phaseId },
    include: { submissions: { include: { items: true } } },
  });
  const approvedTotal = phase.submissions
    .filter((s) => s.status === "APPROVED")
    .flatMap((s) => s.items)
    .reduce((sum, i) => sum + i.qty * i.price, 0);
  if (approvedTotal + qty * price > KASBON_MAX_AMOUNT) {
    return res.status(400).json({
      error: `Total kasbon fase ini akan melebihi limit Rp ${KASBON_MAX_AMOUNT.toLocaleString("id-ID")} (sisa kuota: Rp ${(KASBON_MAX_AMOUNT - approvedTotal).toLocaleString("id-ID")})`,
    });
  }

  await prisma.kasbonItem.create({
    data: {
      submissionId: submission.id,
      reason: reason as KasbonReason,
      item: trimmedItem,
      qty,
      unit: unit.trim(),
      price,
    },
  });
  logActivityFor(req, {
    action: "kasbonItem.create",
    entityType: "KasbonItem",
    description: `Menambahkan item "${trimmedItem}" pada pengajuan kasbon ${submission.phase.division} ${submission.phase.period} Phase ${submission.phase.phase}`,
  });
  const updated = await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: submission.phaseId }, include: phaseInclude });
  res.status(201).json(serializePhase(updated));
});

// Edit a single item. Allowed only while the parent submission is
// PENDING (and only the submission's owner can do it). After
// submission, the item data is locked.
operationalRouter.patch("/kasbon/items/:id", async (req: AuthedRequest, res: Response) => {
  const item = await prisma.kasbonItem.findUnique({
    where: { id: req.params.id },
    include: { submission: true },
  });
  if (!item) return res.status(404).json({ error: "item not found" });
  if (item.submission.submittedByUserId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pengaju yang bisa mengubah item" });
  }
  if (item.submission.status !== "PENDING") {
    return res.status(400).json({ error: "Item hanya bisa diubah saat pengajuan masih PENDING" });
  }

  const { reason, item: name, qty, unit, price } = req.body as {
    reason?: string;
    item?: string;
    qty?: number;
    unit?: string;
    price?: number;
  };
  if (reason !== undefined && !KASBON_REASONS.includes(reason as KasbonReason)) return res.status(400).json({ error: "invalid reason" });
  if (qty !== undefined && qty <= 0) return res.status(400).json({ error: "qty must be positive" });
  if (price !== undefined && price < 0) return res.status(400).json({ error: "price must not be negative" });

  // Per-phase cap check (same as add).
  const newQty = qty ?? item.qty;
  const newPrice = price ?? item.price;
  const phase = await prisma.kasbonPhase.findUniqueOrThrow({
    where: { id: item.submission.phaseId },
    include: { submissions: { include: { items: true } } },
  });
  const approvedTotal = phase.submissions
    .filter((s) => s.status === "APPROVED")
    .flatMap((s) => s.items)
    .reduce((sum, i) => sum + i.qty * i.price, 0);
  if (approvedTotal + newQty * newPrice > KASBON_MAX_AMOUNT) {
    return res.status(400).json({ error: `Total kasbon fase ini akan melebihi limit Rp ${KASBON_MAX_AMOUNT.toLocaleString("id-ID")}` });
  }

  await prisma.kasbonItem.update({
    where: { id: item.id },
    data: {
      ...(reason !== undefined ? { reason: reason as KasbonReason } : {}),
      ...(name !== undefined ? { item: name.trim() } : {}),
      ...(qty !== undefined ? { qty } : {}),
      ...(unit !== undefined ? { unit: unit.trim() } : {}),
      ...(price !== undefined ? { price } : {}),
    },
  });
  logActivityFor(req, {
    action: "kasbonItem.update",
    entityType: "KasbonItem",
    description: `Mengubah item "${item.item}" pada pengajuan kasbon`,
  });
  const updated = await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: item.submission.phaseId }, include: phaseInclude });
  res.json(serializePhase(updated));
});

// Delete a PENDING item. Same ownership + status rules as edit.
operationalRouter.delete("/kasbon/items/:id", async (req: AuthedRequest, res: Response) => {
  const item = await prisma.kasbonItem.findUnique({
    where: { id: req.params.id },
    include: { submission: true },
  });
  if (!item) return res.status(404).json({ error: "item not found" });
  if (item.submission.submittedByUserId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pengaju yang bisa menghapus item" });
  }
  if (item.submission.status !== "PENDING") {
    return res.status(400).json({ error: "Item hanya bisa dihapus saat pengajuan masih PENDING" });
  }
  await prisma.kasbonItem.delete({ where: { id: item.id } });
  logActivityFor(req, {
    action: "kasbonItem.delete",
    entityType: "KasbonItem",
    description: `Menghapus item "${item.item}" dari pengajuan kasbon`,
  });
  const updated = await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: item.submission.phaseId }, include: phaseInclude });
  res.json(serializePhase(updated));
});

// Submit a PENDING submission for OM review. Locks the items and
// triggers a notification to OM + super admin.
operationalRouter.post("/kasbon/submissions/:id/submit", async (req: AuthedRequest, res: Response) => {
  const submission = await prisma.kasbonSubmission.findUnique({
    where: { id: req.params.id },
    include: { items: true, phase: true },
  });
  if (!submission) return res.status(404).json({ error: "submission not found" });
  if (submission.submittedByUserId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pengaju yang bisa mengajukan pengajuan ini" });
  }
  if (submission.status !== "PENDING") {
    return res.status(400).json({ error: "Pengajuan ini sudah diajukan atau sudah direview" });
  }
  if (submission.items.length === 0) {
    return res.status(400).json({ error: "Tambahkan minimal satu item sebelum mengajukan" });
  }

  await prisma.kasbonSubmission.update({
    where: { id: submission.id },
    data: { status: "PENDING" /* unchanged, but logs a touch */, submittedAt: new Date() },
  });
  logActivityFor(req, {
    action: "kasbonSubmission.submit",
    entityType: "KasbonSubmission",
    entityId: submission.id,
    description: `Mengajukan pengajuan kasbon (${submission.items.length} item) pada fase ${submission.phase.division} ${submission.phase.period} Phase ${submission.phase.phase}`,
  });
  const updated = await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: submission.phaseId }, include: phaseInclude });
  res.json(serializePhase(updated));
});

// Review (approve / reject) a PENDING submission. OM only.
operationalRouter.patch("/kasbon/submissions/:id/review", async (req: AuthedRequest, res: Response) => {
  if (!(await canReviewKasbon(req.authUser!))) {
    return res.status(403).json({ error: "Hanya Operational Manager atau super admin yang bisa me-review pengajuan kasbon" });
  }
  const { decision, reviewNote } = req.body as { decision?: "APPROVED" | "REJECTED"; reviewNote?: string };
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
  }
  const trimmedNote = reviewNote?.trim() ?? "";
  if (decision === "REJECTED" && !trimmedNote) {
    return res.status(400).json({ error: "Catatan wajib diisi saat menolak pengajuan kasbon" });
  }

  const submission = await prisma.kasbonSubmission.findUnique({
    where: { id: req.params.id },
    include: { phase: true, submittedByUser: true },
  });
  if (!submission) return res.status(404).json({ error: "submission not found" });
  if (submission.status !== "PENDING") {
    return res.status(400).json({ error: "Pengajuan ini sudah pernah di-review" });
  }

  await prisma.kasbonSubmission.update({
    where: { id: submission.id },
    data: { status: decision, reviewedByUserId: req.authUser!.id, reviewedAt: new Date(), reviewNote: trimmedNote },
  });
  logActivityFor(req, {
    action: decision === "APPROVED" ? "kasbonSubmission.approve" : "kasbonSubmission.reject",
    entityType: "KasbonSubmission",
    entityId: submission.id,
    description: `${decision === "APPROVED" ? "Menyetujui" : "Menolak"} pengajuan kasbon (${submission.submittedByUser.name}) pada fase ${submission.phase.division} ${submission.phase.period} Phase ${submission.phase.phase}`,
  });
  const updated = await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: submission.phaseId }, include: phaseInclude });
  res.json(serializePhase(updated));
});

// Realize an item (fill in link/dates/photos). Only after the parent
// submission is APPROVED. The submission owner (OL) does this. After
// the patch, we re-check whether the whole phase is fully realized
// and flip it to REALIZED if so.
operationalRouter.patch("/kasbon/items/:id/realize", async (req: AuthedRequest, res: Response) => {
  const item = await prisma.kasbonItem.findUnique({
    where: { id: req.params.id },
    include: { submission: true },
  });
  if (!item) return res.status(404).json({ error: "item not found" });
  if (item.submission.submittedByUserId !== req.authUser!.id && !req.authUser!.isSuperAdmin) {
    return res.status(403).json({ error: "Hanya pengaju yang bisa merealisasikan item" });
  }
  if (item.submission.status !== "APPROVED") {
    return res.status(400).json({ error: "Item hanya bisa direalisasikan setelah pengajuan disetujui" });
  }

  const { link, purchaseDate, receivedDate, receiptPhotoUrl, itemPhotoUrl } = req.body as {
    link?: string;
    purchaseDate?: string | null;
    receivedDate?: string | null;
    receiptPhotoUrl?: string | null;
    itemPhotoUrl?: string | null;
  };

  let receipt: string | null | undefined;
  let photo: string | null | undefined;
  try {
    receipt = validPhotoInput(receiptPhotoUrl);
    photo = validPhotoInput(itemPhotoUrl);
  } catch {
    return res.status(400).json({ error: "Foto eviden tidak valid atau melebihi 4MB" });
  }

  await prisma.kasbonItem.update({
    where: { id: item.id },
    data: {
      ...(link !== undefined ? { link: link.trim() } : {}),
      ...(purchaseDate !== undefined ? { purchaseDate: purchaseDate ? new Date(purchaseDate) : null } : {}),
      ...(receivedDate !== undefined ? { receivedDate: receivedDate ? new Date(receivedDate) : null } : {}),
      ...(receipt !== undefined ? { receiptPhotoUrl: receipt } : {}),
      ...(photo !== undefined ? { itemPhotoUrl: photo } : {}),
    },
  });
  logActivityFor(req, {
    action: "kasbonItem.realize",
    entityType: "KasbonItem",
    description: `Merealisasikan item "${item.item}"`,
  });

  // Re-check parent phase realization.
  const updated = await maybeRealizePhase(item.submission.phaseId);
  if (updated && updated.status === "REALIZED" && updated.realizedAt) {
    logActivityFor(req, {
      action: "kasbonPhase.realize",
      entityType: "KasbonPhase",
      entityId: updated.id,
      description: `Fase kasbon ${updated.division} ${updated.period} Phase ${updated.phase} sudah terealisasi seluruhnya`,
    });
  }
  const full = updated
    ? await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: updated.id }, include: phaseInclude })
    : await prisma.kasbonPhase.findUniqueOrThrow({ where: { id: item.submission.phaseId }, include: phaseInclude });
  res.json(serializePhase(full));
});

// --- Export to .xlsx --------------------------------------------------------
// Per-submission export (DEC-061). Old model exported the whole phase;
// new model exports a single submission so a rejected submission
// doesn't pollute the file. Only available once the submission is
// APPROVED — the user said "download" should appear after approval.
// Same Form + Data Input sheet layout the team was used to, with
// Vortec branding (DEC-045).
const REASON_LABEL: Record<KasbonReason, string> = {
  DEVELOPMENT: "Development",
  PRODUCTION: "Production",
  OPERATION: "Operation",
  TOOLS_ASSET: "Tools / Asset",
};

function formatExcelDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

operationalRouter.get("/kasbon/submissions/:id/export", async (req: AuthedRequest, res: Response) => {
  if (!((await canMonitorOperational(req.authUser!)) || (await canReviewKasbon(req.authUser!)))) {
    return res.status(403).json({ error: "Hanya Operational Manager/Leader atau super admin yang bisa export rekap kasbon" });
  }
  const submission = await prisma.kasbonSubmission.findUnique({
    where: { id: req.params.id },
    include: { items: { orderBy: { createdAt: "asc" } }, phase: true, submittedByUser: { select: { name: true } } },
  });
  if (!submission) return res.status(404).json({ error: "submission not found" });
  if (submission.status !== "APPROVED") {
    return res.status(400).json({ error: "Pengajuan ini belum disetujui — download hanya tersedia setelah pengajuan disetujui" });
  }

  const [year, month] = submission.phase.period.split("-");
  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vortec Management";
  workbook.created = new Date();

  // --- Sheet 1: Form (category summary) ---
  const form = workbook.addWorksheet("Form");
  form.columns = [{ width: 4 }, { width: 22 }, { width: 22 }, { width: 18 }];
  form.mergeCells("A1:D1");
  form.getCell("A1").value = "VORTEC SYSTEM";
  form.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFB91C1C" } };
  form.mergeCells("A2:D2");
  form.getCell("A2").value = "FORMULIR REALISASI KASBON OPERASIONAL";
  form.getCell("A2").font = { bold: true, size: 12 };
  form.mergeCells("A3:D3");
  form.getCell("A3").value = "No. Doc. VOR-FRM-OPS-01.00 · Klasifikasi: Internal";
  form.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF666666" } };
  form.addRow([]);
  form.addRow(["", "Periode", monthName]);
  form.addRow(["", "Divisi", submission.phase.division]);
  form.addRow(["", "Phase", submission.phase.phase]);
  form.addRow(["", "Diajukan Oleh", submission.submittedByUser.name]);
  form.addRow(["", "Tanggal Export", new Date().toLocaleDateString("id-ID")]);
  form.addRow([]);

  const summaryHeaderRow = form.addRow(["No", "Biaya", "", "Jumlah"]);
  summaryHeaderRow.font = { bold: true };
  const totalsByReason = new Map<KasbonReason, number>(KASBON_REASONS.map((r) => [r, 0]));
  for (const item of submission.items) {
    totalsByReason.set(item.reason as KasbonReason, (totalsByReason.get(item.reason as KasbonReason) ?? 0) + item.qty * item.price);
  }
  let grandTotal = 0;
  KASBON_REASONS.forEach((reason, idx) => {
    const sum = totalsByReason.get(reason) ?? 0;
    grandTotal += sum;
    const row = form.addRow([idx + 1, REASON_LABEL[reason], "", sum]);
    row.getCell(4).numFmt = "#,##0";
  });
  const totalRow = form.addRow(["", "TOTAL", "", grandTotal]);
  totalRow.font = { bold: true };
  totalRow.getCell(4).numFmt = "#,##0";

  // --- Sheet 2: Data Input (itemized lines) ---
  const dataSheet = workbook.addWorksheet("Data Input");
  dataSheet.columns = [
    { header: "Reason", key: "reason", width: 14 },
    { header: "Item", key: "item", width: 50 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Satuan", key: "unit", width: 10 },
    { header: "Link", key: "link", width: 30 },
    { header: "Purchase Date", key: "purchaseDate", width: 14 },
    { header: "Received Date", key: "receivedDate", width: 14 },
    { header: "Harga", key: "price", width: 14 },
    { header: "Subtotal", key: "subtotal", width: 14 },
  ];
  dataSheet.getRow(1).font = { bold: true };
  for (const item of submission.items) {
    dataSheet.addRow({
      reason: REASON_LABEL[item.reason as KasbonReason],
      item: item.item,
      qty: item.qty,
      unit: item.unit,
      link: item.link,
      purchaseDate: formatExcelDate(item.purchaseDate),
      receivedDate: formatExcelDate(item.receivedDate),
      price: item.price,
      subtotal: item.qty * item.price,
    });
  }
  dataSheet.getColumn("price").numFmt = "#,##0";
  dataSheet.getColumn("subtotal").numFmt = "#,##0";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Rekap Realisasi Kasbon ${submission.phase.division} ${monthName} Phase ${submission.phase.phase}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});
