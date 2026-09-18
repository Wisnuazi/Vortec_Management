"use client";

import { useCallback, useEffect, useState } from "react";
import {
  operationalApi,
  type ApiDailyReport,
  type ApiKasbonPhase,
  type NewKasbonItemData,
  type RealizeKasbonItemData,
} from "@/lib/operational-api";
import { canAccessKasbon } from "@/lib/auth-api";
import { useAuth } from "./useAuth";

export function useOperational() {
  const { token, user } = useAuth();
  const [dailyReports, setDailyReports] = useState<ApiDailyReport[]>([]);
  const [kasbonPhases, setKasbonPhases] = useState<ApiKasbonPhase[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const [reports, phases] = await Promise.all([
      operationalApi.dailyReports.list(token),
      canAccessKasbon(user) ? operationalApi.kasbon.listPhases(token) : Promise.resolve([]),
    ]);
    setDailyReports(reports);
    setKasbonPhases(phases);
  }, [token, user]);

  useEffect(() => {
    if (!token) return;
    reload()
      .catch((err) => console.error("Failed to load operational data:", err))
      .finally(() => setHydrated(true));
  }, [reload, token]);

  const applyReport = useCallback((updated: ApiDailyReport) => {
    setDailyReports((prev) => {
      const idx = prev.findIndex((r) => r.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const applyPhase = useCallback((updated: ApiKasbonPhase) => {
    setKasbonPhases((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, []);

  const createReport = useCallback(
    async (data: { date: string; activities: string }): Promise<ApiDailyReport> => {
      const created = await operationalApi.dailyReports.create(token, data);
      applyReport(created);
      return created;
    },
    [token, applyReport]
  );
  const updateReport = useCallback(
    async (id: string, data: Partial<{ date: string; activities: string }>) => {
      applyReport(await operationalApi.dailyReports.update(token, id, data));
    },
    [token, applyReport]
  );
  const removeReport = useCallback(
    async (id: string) => {
      await operationalApi.dailyReports.remove(token, id);
      setDailyReports((prev) => prev.filter((r) => r.id !== id));
    },
    [token]
  );

  // Daily-report attachment handlers.
  const addReportAttachment = useCallback(
    async (reportId: string, data: import("@/lib/operational-api").NewAttachmentData): Promise<void> => {
      const created = await operationalApi.dailyReports.addAttachment(token, reportId, data);
      setDailyReports((prev) =>
        prev.map((r) =>
          r.id === reportId ? { ...r, attachments: [...(r.attachments ?? []), created] } : r
        )
      );
    },
    [token]
  );

  const removeReportAttachment = useCallback(
    async (reportId: string, attachmentId: string) => {
      await operationalApi.dailyReports.removeAttachment(token, reportId, attachmentId);
      setDailyReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, attachments: (r.attachments ?? []).filter((a) => a.id !== attachmentId) }
            : r
        )
      );
    },
    [token]
  );

  // --- Kasbon (DEC-061: phase + multi-submission) ----------------------

  const createPhase = useCallback(
    async (data: { period: string }) => {
      const created = await operationalApi.kasbon.createPhase(token, data);
      applyPhase(created);
      return created;
    },
    [token, applyPhase]
  );
  const removePhase = useCallback(
    async (id: string) => {
      await operationalApi.kasbon.removePhase(token, id);
      setKasbonPhases((prev) => prev.filter((p) => p.id !== id));
    },
    [token]
  );

  const createSubmission = useCallback(
    async (phaseId: string, data: { batchNote?: string }) => {
      applyPhase(await operationalApi.kasbon.createSubmission(token, phaseId, data));
    },
    [token, applyPhase]
  );
  const submitSubmission = useCallback(
    async (submissionId: string) => {
      applyPhase(await operationalApi.kasbon.submitSubmission(token, submissionId));
    },
    [token, applyPhase]
  );
  const reviewSubmission = useCallback(
    async (submissionId: string, decision: "APPROVED" | "REJECTED", reviewNote: string) => {
      applyPhase(
        await operationalApi.kasbon.reviewSubmission(token, submissionId, { decision, reviewNote })
      );
    },
    [token, applyPhase]
  );

  const addItem = useCallback(
    async (submissionId: string, data: NewKasbonItemData) => {
      applyPhase(await operationalApi.kasbon.addItem(token, submissionId, data));
    },
    [token, applyPhase]
  );
  const updateItem = useCallback(
    async (itemId: string, data: Partial<NewKasbonItemData>) => {
      applyPhase(await operationalApi.kasbon.updateItem(token, itemId, data));
    },
    [token, applyPhase]
  );
  const realizeItem = useCallback(
    async (itemId: string, data: RealizeKasbonItemData) => {
      applyPhase(await operationalApi.kasbon.realizeItem(token, itemId, data));
    },
    [token, applyPhase]
  );
  const removeItem = useCallback(
    async (itemId: string) => {
      applyPhase(await operationalApi.kasbon.removeItem(token, itemId));
    },
    [token, applyPhase]
  );

  // xlsx download — the page passes a filename hint (we read the real
  // filename from the Content-Disposition header).
  const downloadSubmission = useCallback(
    async (submissionId: string, filenameHint: string) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/operational/kasbon/submissions/${submissionId}/export`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export gagal (${res.status})`);
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : filenameHint;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    [token]
  );

  return {
    dailyReports,
    kasbonPhases,
    hydrated,
    createReport,
    updateReport,
    removeReport,
    addReportAttachment,
    removeReportAttachment,
    createPhase,
    removePhase,
    createSubmission,
    submitSubmission,
    reviewSubmission,
    addItem,
    updateItem,
    realizeItem,
    removeItem,
    downloadSubmission,
  };
}

export type UseOperational = ReturnType<typeof useOperational>;
