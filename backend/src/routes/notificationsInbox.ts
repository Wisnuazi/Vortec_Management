import { Router, type Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, type AuthedRequest } from "../auth";

export const notificationsInboxRouter = Router();
notificationsInboxRouter.use(requireAuth);

// DEC-063: per-user notification inbox. The existing
// `routes/notifications.ts` returns a *derived* set of operational
// + project signals (due-date reminders, approval queues) — those
// are still useful. This router adds the persistent layer that
// records the things-that-happened (BOM state changes today, future
// event families later) and exposes them in the same Notifications
// page alongside the derived list.
//
// The list endpoint returns the most-recent 100 unread + recent
// notifications for the caller, ordered newest-first. The
// mark-as-read endpoint flips readAt for one (or all) rows.
notificationsInboxRouter.get("/", async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.notification.findMany({
    where: { userId: req.authUser!.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unreadCount = await prisma.notification.count({
    where: { userId: req.authUser!.id, readAt: null },
  });
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      projectId: r.projectId,
      entityType: r.entityType,
      entityId: r.entityId,
      readAt: r.readAt,
      createdAt: r.createdAt,
    })),
    unreadCount,
  });
});

notificationsInboxRouter.post("/:id/read", async (req: AuthedRequest, res: Response) => {
  // Scope to the caller's rows so one user can't mark someone else's
  // notifications as read.
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.authUser!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

notificationsInboxRouter.post("/read-all", async (req: AuthedRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.authUser!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});
