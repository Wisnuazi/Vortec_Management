"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { projectsApi } from "@/lib/projects-api";
import { formatDate } from "@/lib/format";
import type { ApprovalTask, ApprovalMaterialRequest } from "@/lib/approvals-api";
import type { ApiKasbonSubmission } from "@/lib/operational-api";
import { PaperclipIcon } from "@/components/icons";
import styles from "./ApprovalCards.module.css";

// DEC-082: shared approval-card components used by /approvals and its
// sub-routes (/approvals/material-requests, /approvals/kasbon). These
// were extracted from the old single-page tab implementation so each
// sub-route page can import just what it needs.

export function AttachmentsReadOnly({ attachments }: { attachments: ApprovalTask["attachments"] }) {
  const { locale } = usePreferences();
  if (attachments.length === 0) return null;
  return (
    <ul className={styles.attachList}>
      {attachments.map((a) => (
        <li key={a.id} className={styles.attachItem}>
          <PaperclipIcon />
          {a.kind === "LINK" ? (
            <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer">
              {a.fileName}
            </a>
          ) : (
            <a href={a.dataUrl ?? "#"} download={a.fileName}>
              {a.fileName}
            </a>
          )}
          <span className={styles.hintSmall}>
            {a.uploadedByUserName} · {formatDate(a.createdAt, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TaskApprovalCard({ task, onChanged }: { task: ApprovalTask; onChanged: () => Promise<void> }) {
  const { t, locale } = usePreferences();
  const { token } = useAuth();

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <Link href={`/projects/${task.projectId}`} className={styles.projectTag}>{task.projectName}</Link>
        <span className={styles.title}>{task.title}</span>
        {task.assignedRoleTitles.length > 0 && (
          <span className={styles.roleBadge}>{task.assignedRoleTitles.join(", ")}</span>
        )}
      </div>
      {task.description && <p className={styles.notes}>{task.description}</p>}
      {(task.startDate || task.dueDate) && (
        <span className={styles.hintSmall}>
          {task.startDate ? formatDate(task.startDate, locale) : "?"} → {task.dueDate ? formatDate(task.dueDate, locale) : "?"}
        </span>
      )}
      <AttachmentsReadOnly attachments={task.attachments} />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.approveBtn}
          onClick={async () => {
            await projectsApi.updateTask(token, task.projectId, task.id, { status: "DONE" });
            await onChanged();
          }}
        >
          {t("approvals.approve")}
        </button>
        <button
          type="button"
          className={styles.rejectBtn}
          onClick={async () => {
            await projectsApi.updateTask(token, task.projectId, task.id, { status: "REJECTED" });
            await onChanged();
          }}
        >
          {t("approvals.reject")}
        </button>
      </div>
    </div>
  );
}

export function MaterialRequestApprovalCard({ request, onChanged }: { request: ApprovalMaterialRequest; onChanged: () => Promise<void> }) {
  const { t } = usePreferences();
  const { token } = useAuth();
  const [reviewNote, setReviewNote] = useState("");

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <Link href={`/projects/${request.projectId}`} className={styles.projectTag}>{request.projectName}</Link>
        <span className={styles.title}>{request.title}</span>
      </div>
      <span className={styles.hintSmall}>
        {t("materialRequests.submittedBy")} {request.requestedByUserName}
      </span>
      {request.note && <p className={styles.notes}>{request.note}</p>}
      <ul className={styles.itemList}>
        {request.items.map((i) => (
          <li key={i.id} className={styles.item}>
            {i.materialName} <span className={styles.hintSmall}>× {i.quantity} {i.unit}</span>
          </li>
        ))}
      </ul>
      <AttachmentsReadOnly attachments={request.attachments} />
      <form
        className={styles.inlineForm}
        onSubmit={async (e) => {
          e.preventDefault();
          await projectsApi.reviewMaterialRequest(token, request.projectId, request.id, { decision: "APPROVED", reviewNote });
          setReviewNote("");
          await onChanged();
        }}
      >
        <input
          placeholder={t("materialRequests.reviewNotePlaceholder")}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
        />
        <button type="submit" className={styles.approveBtn}>
          {t("approvals.approve")}
        </button>
        <button
          type="button"
          className={styles.rejectBtn}
          onClick={async () => {
            await projectsApi.reviewMaterialRequest(token, request.projectId, request.id, { decision: "REJECTED", reviewNote });
            setReviewNote("");
            await onChanged();
          }}
        >
          {t("approvals.reject")}
        </button>
      </form>
    </div>
  );
}

export function KasbonSubmissionCard({
  submission,
  phaseInfo,
  onReview,
}: {
  submission: ApiKasbonSubmission & { submittedByUserName: string };
  phaseInfo: { division: string; period: string; phase: number };
  onReview: (decision: "APPROVED" | "REJECTED", reviewNote: string) => Promise<void>;
}) {
  const { t, locale } = usePreferences();
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const rupiah = (n: number) =>
    `Rp ${n.toLocaleString(locale === "id" ? "id-ID" : "en-US")}`;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.projectTag}>
          {phaseInfo.division} · {phaseInfo.period} · Phase {phaseInfo.phase}
        </span>
        <span className={styles.title}>{submission.batchNote || t("operational.submissionDefaultTitle")}</span>
        <span className={styles.roleBadge}>{submission.submittedByUserName}</span>
      </div>
      <span className={styles.hintSmall}>
        {t("operational.submissionTotal")} <strong>{rupiah(submission.total)}</strong>
      </span>
      {submission.items.length > 0 && (
        <button type="button" className={styles.expandBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("common.hide") : t("common.show")} {submission.items.length} item
        </button>
      )}
      {expanded && (
        <ul className={styles.itemList}>
          {submission.items.map((item) => (
            <li key={item.id} className={styles.item}>
              {item.item}{" "}
              <span className={styles.hintSmall}>
                × {item.qty} · {rupiah(item.price)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {submission.batchNote && <p className={styles.notes}>{submission.batchNote}</p>}
      <form
        className={styles.inlineForm}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onReview("APPROVED", reviewNote);
            setReviewNote("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          placeholder={t("operational.kasbonReviewNotePlaceholder")}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
        />
        <button type="submit" className={styles.approveBtn} disabled={busy}>
          {t("operational.kasbonApprove")}
        </button>
        <button
          type="button"
          className={styles.rejectBtn}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onReview("REJECTED", reviewNote);
              setReviewNote("");
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("operational.kasbonReject")}
        </button>
      </form>
    </div>
  );
}