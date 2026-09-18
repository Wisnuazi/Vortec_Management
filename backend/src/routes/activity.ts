import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, isPrivileged, userHasRoleTitle, type AuthedRequest } from "../auth";

export const activityRouter = Router();
activityRouter.use(requireAuth);

const ONLINE_WITHIN_MS = 5 * 60 * 1000;

// Super admin, Operational Manager, Operational Leader, or Director —
// see DEC-026 (OM/super admin), DEC-051 (Director oversight), and the
// follow-up to extend Operational Leader access (it monitors the
// technical team day-to-day, so Activity Log helps oversee their
// productivity).
async function requireActivityViewer(req: AuthedRequest, res: Response, next: () => void) {
  if (await isPrivileged(req.authUser!)) return next();
  if (await userHasRoleTitle(req.authUser!.id, "Operational Leader")) return next();
  res.status(403).json({ error: "Halaman ini khusus untuk super admin, Operational Manager, Operational Leader, dan Director" });
}

// DEC-078: parse the optional `from` / `to` ISO datetime query params into
// Date objects. Returns null for both when absent. No month or year cap —
// the user can download logs from any time range the DB has rows for.
function parseDateRange(q: Record<string, unknown>): { from: Date | null; to: Date | null } {
  const rawFrom = typeof q.from === "string" ? q.from.trim() : "";
  const rawTo = typeof q.to === "string" ? q.to.trim() : "";
  const from = rawFrom ? new Date(rawFrom) : null;
  const to = rawTo ? new Date(rawTo) : null;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null,
  };
}

// DEC-078: build the activity-log WHERE clause shared by the list endpoint
// and the CSV export. Filter inputs:
//   - search  : ILIKE across description / userName / action / entityType
//   - from/to : inclusive [from, to] range on createdAt
//   - before  : backward-cursor for pagination (createdAt < before)
// All filters AND together; empty inputs are no-ops.
function buildActivityWhere(q: Record<string, unknown>) {
  const { from, to } = parseDateRange(q);
  const search = typeof q.q === "string" ? q.q.trim() : "";
  const before = typeof q.before === "string" ? new Date(q.before) : null;

  const createdAt: Record<string, Date> = {};
  if (from) createdAt.gte = from;
  if (to) createdAt.lte = to;
  if (before && !Number.isNaN(before.getTime())) createdAt.lt = before;

  const where: Record<string, unknown> = {};
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { userName: { contains: search, mode: "insensitive" } },
      { action: { contains: search, mode: "insensitive" } },
      { entityType: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

activityRouter.get("/", requireActivityViewer, async (req: AuthedRequest, res: Response) => {
  // DEC-078: bump max page size to 1000 so the in-page list can show
  // larger filtered ranges, while still bounding a single response.
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50));
  const where = buildActivityWhere(req.query as Record<string, unknown>);

  const entries = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json(
    entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.userName,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      description: e.description,
      createdAt: e.createdAt,
    }))
  );
});

// DEC-078: CSV export of the activity log. Applies the same search/date
// filters as the list endpoint, but bypasses the pagination cursor and
// returns every matching row. The user explicitly asked for an
// unrestricted time range — no month cap, no row cap other than what
// the DB will comfortably return in one stream.
activityRouter.get("/export.csv", requireActivityViewer, async (req: AuthedRequest, res: Response) => {
  const where = buildActivityWhere(req.query as Record<string, unknown>);
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);

  const filenameParts = ["activity-log"];
  if (from) filenameParts.push(`from-${from.toISOString().slice(0, 10)}`);
  if (to) filenameParts.push(`to-${to.toISOString().slice(0, 10)}`);
  if (filenameParts.length === 1) filenameParts.push(new Date().toISOString().slice(0, 10));
  const filename = filenameParts.join("_") + ".csv";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");

  // Header row — keep the same column order as the in-page row to make
  // manual review easy.
  res.write("createdAt,userName,action,entityType,entityId,description\n");

  // Stream rows in 500-row batches so a multi-year export doesn't OOM
  // the backend or the client. Prisma cursor pagination on the
  // composite (createdAt desc, id desc) keeps the order stable.
  const PAGE_SIZE = 500;
  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const batch = await prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    for (const e of batch) {
      const row = [
        e.createdAt.toISOString(),
        e.userName,
        e.action,
        e.entityType,
        e.entityId ?? "",
        e.description,
      ]
        .map(csvEscape)
        .join(",");
      res.write(row + "\n");
    }
    total += batch.length;
    if (batch.length < PAGE_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }
  res.end(`# rows: ${total}\n`);
});

// DEC-078: quote a CSV cell per RFC 4180 — wrap in double quotes if the
// value contains a comma, double quote, CR, or LF; double up any
// embedded quotes. Always quote user-generated strings (description,
// userName) so commas in free-text columns don't break column alignment.
function csvEscape(value: string): string {
  const needsQuote = /[",\r\n]/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

activityRouter.get("/online", requireActivityViewer, async (_req: AuthedRequest, res: Response) => {
  const cutoff = new Date(Date.now() - ONLINE_WITHIN_MS);
  const users = await prisma.user.findMany({
    where: { lastSeenAt: { gte: cutoff } },
    orderBy: { lastSeenAt: "desc" },
    include: { userRoles: { include: { role: { select: { title: true } } } } },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin,
      roleTitles: u.userRoles.map((ur) => ur.role.title),
      lastSeenAt: u.lastSeenAt,
    }))
  );
});