"use client";

import { useCallback, useEffect, useState } from "react";
import {
  notificationsApi,
  notificationsInboxApi,
  type InboxNotification,
  type NotificationsData,
} from "@/lib/notifications-api";
import { useAuth } from "./useAuth";

const EMPTY: NotificationsData = {
  project: {
    overdueTasks: [],
    upcomingTasks: [],
    overdueProjects: [],
    upcomingProjects: [],
    taskApprovals: [],
    materialRequestApprovals: [],
  },
  operational: {
    kasbonPendingReview: [],
    kasbonNeedsRevision: [],
    kasbonApproved: [],
  },
  bom: {
    pendingReview: [],
    rejected: [],
    approvedNeedsPurchase: [],
    processing: [],
    arrived: [],
  },
  pendingApprovalsCount: 0,
};

const POLL_MS = 60_000;

export function useNotifications() {
  const { token } = useAuth();
  const [data, setData] = useState<NotificationsData>(EMPTY);
  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const [derived, persistent] = await Promise.all([
      notificationsApi.list(token),
      notificationsInboxApi.list(token),
    ]);
    setData(derived);
    setInbox(persistent.items);
    setUnreadCount(persistent.unreadCount);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load notifications:", err))
      .finally(() => setHydrated(true));
    const interval = setInterval(() => {
      reload().catch((err) => console.error("Failed to refresh notifications:", err));
    }, POLL_MS);
    // DEC-073: refresh immediately when the user comes back to the tab
    // — covers the case where they spent >60s on another page (e.g.
    // /approvals) and the badge is now stale.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reload().catch((err) => console.error("Failed to refresh on focus:", err));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reload, token]);

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return;
      await notificationsInboxApi.markRead(token, id);
      setInbox((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    [token]
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    await notificationsInboxApi.markAllRead(token);
    const now = new Date().toISOString();
    setInbox((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
  }, [token]);

  const projectCount =
    data.project.overdueTasks.length +
    data.project.upcomingTasks.length +
    data.project.overdueProjects.length +
    data.project.upcomingProjects.length +
    data.project.taskApprovals.length +
    data.project.materialRequestApprovals.length;
  const operationalCount = data.operational.kasbonPendingReview.length + data.operational.kasbonNeedsRevision.length;
  // DEC-073: include the BOM domain in the sidebar badge so it matches
  // every section rendered on /notifications. Previously the badge
  // ignored `bom.*` entirely, which is why the navbar showed "4" while
  // the page read "tidak ada" — the 4 were rejected/processing/arrived
  // BOM items the page never displayed.
  const bomCount =
    data.bom.pendingReview.length +
    data.bom.rejected.length +
    data.bom.approvedNeedsPurchase.length +
    data.bom.processing.length +
    data.bom.arrived.length;
  const count = projectCount + operationalCount + bomCount + unreadCount;

  return {
    project: data.project,
    operational: data.operational,
    bom: data.bom,
    pendingApprovalsCount: data.pendingApprovalsCount,
    hydrated,
    reload,
    count,
    projectCount,
    operationalCount,
    bomCount,
    inbox,
    unreadCount,
    markRead,
    markAllRead,
    // Back-compat flat accessors for callers that only care about the
    // project-domain due-date reminders (e.g. the home dashboard tiles).
    overdueTasks: data.project.overdueTasks,
    upcomingTasks: data.project.upcomingTasks,
    overdueProjects: data.project.overdueProjects,
    upcomingProjects: data.project.upcomingProjects,
  };
}

export type UseNotifications = ReturnType<typeof useNotifications>;
