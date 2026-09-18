const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type NotificationTask = {
  id: string;
  title: string;
  dueDate: string;
  overdue: boolean;
  assignedRoleTitle: string | null;
  projectId: string;
  projectName: string;
};

export type NotificationProject = {
  id: string;
  name: string;
  targetDate: string;
  overdue: boolean;
  stage: string;
};

export type NotificationTaskApproval = {
  id: string;
  title: string;
  dueDate: string | null;
  assignedRoleTitle: string | null;
  projectId: string;
  projectName: string;
};

export type NotificationMaterialRequestApproval = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  requestedByUserName: string;
  createdAt: string;
};

export type NotificationKasbonPhase = {
  id: string;
  division: string;
  period: string;
  phase: number;
  requestedByUserName: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type ProjectNotifications = {
  overdueTasks: NotificationTask[];
  upcomingTasks: NotificationTask[];
  overdueProjects: NotificationProject[];
  upcomingProjects: NotificationProject[];
  taskApprovals: NotificationTaskApproval[];
  materialRequestApprovals: NotificationMaterialRequestApproval[];
};

export type OperationalNotifications = {
  kasbonPendingReview: NotificationKasbonPhase[];
  kasbonNeedsRevision: NotificationKasbonPhase[];
  kasbonApproved: NotificationKasbonPhase[];
};

// DEC-064: BOM domain notifications added to match backend response.
export type BomNotifications = {
  pendingReview: NotificationBomItem[];
  rejected: NotificationBomItem[];
  approvedNeedsPurchase: NotificationBomItem[];
  processing: NotificationBomItem[];
  arrived: NotificationBomItem[];
};

export type NotificationBomItem = {
  id: string;
  bomId: string;
  name: string;
  quantity: number;
  unit: string;
  status: string;
  submittedByUserName: string;
  approvedByUserName: string | null;
  processedByUserName: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  purchasingUpdatedAt: string | null;
  approveNote: string;
  projectId: string;
  projectName: string;
};

export type NotificationsData = {
  project: ProjectNotifications;
  operational: OperationalNotifications;
  bom: BomNotifications;
  pendingApprovalsCount: number;
};

// DEC-063: persistent notifications. Each row is one event that
// happened to a BOM item (or, in the future, any other entity).
// The list endpoint returns the 100 most-recent rows for the
// caller; the count is the unread subset, which the sidebar uses
// for the badge.
export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  projectId: string | null;
  entityType: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
};
export type InboxNotificationsData = {
  items: InboxNotification[];
  unreadCount: number;
};

async function apiFetch<T>(path: string, token: string | null, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: string };
      throw new Error(parsed.error || text);
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(text || `Request failed (${res.status})`);
      throw err;
    }
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const notificationsApi = {
  list: (token: string | null) => apiFetch<NotificationsData>("/notifications", token),
};

export const notificationsInboxApi = {
  list: (token: string | null) => apiFetch<InboxNotificationsData>("/notifications-inbox", token),
  markRead: (token: string | null, id: string) =>
    apiFetch<void>(`/notifications-inbox/${id}/read`, token, { method: "POST" }),
  markAllRead: (token: string | null) =>
    apiFetch<void>("/notifications-inbox/read-all", token, { method: "POST" }),
};
