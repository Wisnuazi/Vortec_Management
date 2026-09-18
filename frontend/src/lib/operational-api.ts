const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiAttachment = {
  id: string;
  kind: "FILE" | "LINK";
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string | null;
  url: string | null;
  createdAt: string;
};

export type ApiDailyReport = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  activities: string;
  attachments: ApiAttachment[];
  createdAt: string;
  updatedAt: string;
};

// --- Kasbon (phase + multi-submission, DEC-061) -----------------------------

export type KasbonPhaseStatus = "OPEN" | "REALIZED";
export const KASBON_PHASE_STATUSES: KasbonPhaseStatus[] = ["OPEN", "REALIZED"];

export type KasbonSubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";
export const KASBON_SUBMISSION_STATUSES: KasbonSubmissionStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export type KasbonReason = "DEVELOPMENT" | "PRODUCTION" | "OPERATION" | "TOOLS_ASSET";
export const KASBON_REASONS: KasbonReason[] = ["DEVELOPMENT", "PRODUCTION", "OPERATION", "TOOLS_ASSET"];

export const KASBON_MAX_AMOUNT = 5_000_000;

// Minimal item data at submission time. Realisation fields (link,
// dates, photos) live on the same model but are filled AFTER approval
// via a dedicated realise endpoint.
export type NewKasbonItemData = {
  reason: KasbonReason;
  item: string;
  qty: number;
  unit: string;
  price: number;
};

// Body for the realise step — all optional so the page can fill them
// in one at a time.
export type RealizeKasbonItemData = {
  link?: string;
  purchaseDate?: string | null;
  receivedDate?: string | null;
  receiptPhotoUrl?: string | null;
  itemPhotoUrl?: string | null;
};

export type ApiKasbonItem = {
  id: string;
  reason: KasbonReason;
  item: string;
  qty: number;
  unit: string;
  price: number;
  link: string;
  purchaseDate: string | null;
  receivedDate: string | null;
  receiptPhotoUrl: string | null;
  itemPhotoUrl: string | null;
  realized: boolean;
};

export type ApiKasbonSubmission = {
  id: string;
  status: KasbonSubmissionStatus;
  batchNote: string;
  items: ApiKasbonItem[];
  total: number;
  submittedByUserId: string;
  submittedByUserName: string;
  submittedAt: string;
  reviewedByUserName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type ApiKasbonPhase = {
  id: string;
  division: string;
  period: string;
  phase: number;
  status: KasbonPhaseStatus;
  realizedAt: string | null;
  createdByUserId: string;
  createdByUserName: string;
  submissions: ApiKasbonSubmission[];
  total: number;
  remaining: number;
  createdAt: string;
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

export type NewAttachmentData =
  | { kind: "FILE"; fileName: string; mimeType: string; fileSize: number; dataUrl: string }
  | { kind: "LINK"; fileName: string; url: string };

export const operationalApi = {
  dailyReports: {
    list: (token: string | null) => apiFetch<ApiDailyReport[]>("/operational/daily-reports", token),
    create: (token: string | null, data: { date: string; activities: string }) =>
      apiFetch<ApiDailyReport>("/operational/daily-reports", token, { method: "POST", body: JSON.stringify(data) }),
    update: (token: string | null, id: string, data: Partial<{ date: string; activities: string }>) =>
      apiFetch<ApiDailyReport>(`/operational/daily-reports/${id}`, token, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (token: string | null, id: string) => apiFetch<void>(`/operational/daily-reports/${id}`, token, { method: "DELETE" }),
    addAttachment: (token: string | null, reportId: string, data: NewAttachmentData) =>
      apiFetch<ApiAttachment>(`/operational/daily-reports/${reportId}/attachments`, token, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    removeAttachment: (token: string | null, reportId: string, attachmentId: string) =>
      apiFetch<void>(`/operational/daily-reports/${reportId}/attachments/${attachmentId}`, token, {
        method: "DELETE",
      }),
  },
  kasbon: {
    listPhases: (token: string | null) => apiFetch<ApiKasbonPhase[]>("/operational/kasbon/phases", token),
    createPhase: (token: string | null, data: { period: string }) =>
      apiFetch<ApiKasbonPhase>("/operational/kasbon/phases", token, { method: "POST", body: JSON.stringify(data) }),
    removePhase: (token: string | null, id: string) => apiFetch<void>(`/operational/kasbon/phases/${id}`, token, { method: "DELETE" }),

    // Submissions
    createSubmission: (token: string | null, phaseId: string, data: { batchNote?: string }) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/phases/${phaseId}/submissions`, token, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    submitSubmission: (token: string | null, submissionId: string) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/submissions/${submissionId}/submit`, token, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    reviewSubmission: (
      token: string | null,
      submissionId: string,
      data: { decision: "APPROVED" | "REJECTED"; reviewNote: string }
    ) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/submissions/${submissionId}/review`, token, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    // Items
    addItem: (token: string | null, submissionId: string, data: NewKasbonItemData) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/submissions/${submissionId}/items`, token, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateItem: (token: string | null, itemId: string, data: Partial<NewKasbonItemData>) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/items/${itemId}`, token, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    realizeItem: (token: string | null, itemId: string, data: RealizeKasbonItemData) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/items/${itemId}/realize`, token, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    removeItem: (token: string | null, itemId: string) =>
      apiFetch<ApiKasbonPhase>(`/operational/kasbon/items/${itemId}`, token, { method: "DELETE" }),

    // Per-submission xlsx export (DEC-061). Old model exported the
    // whole phase; the new model exports one submission at a time.
    exportSubmission: async (token: string | null, submissionId: string): Promise<Blob> => {
      const res = await fetch(`${API_URL}/operational/kasbon/submissions/${submissionId}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Kasbon export failed: ${res.status}`);
      return res.blob();
    },
  },
};
